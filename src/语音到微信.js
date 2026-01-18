var Settings = android.provider.Settings
var Uri = android.net.Uri
auto.waitFor()
if(!requestScreenCapture()){ toast("请求截图失败"); exit() }
if (!Settings.canDrawOverlays(context)) {
  var intent = new android.content.Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.getPackageName()))
  intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
  context.startActivity(intent)
  toast("请授予悬浮窗权限后返回重新运行")
  exit()
}
var window = floaty.window(
  <vertical padding="8" bg="#33000000">
    <button id="recordBtn" text="按住说话" textSize="18sp" h="64dp" w="*"/>
    <button id="exitBtn" text="退出" textSize="16sp" h="48dp" w="*"/>
  </vertical>
)
var w = Math.max(260, Math.floor(device.width * 0.30))
var h = Math.max(140, Math.floor(device.height * 0.18))
window.setSize(w, h)
try { window.setAdjustEnabled(true) } catch (e) {}
try {
  var x = Math.max(0, device.width - w - 5)
  var y = Math.max(0, 20)
  window.setPosition(x, y)
} catch (e) {
  window.setPosition(device.width - w - 5, 20)
}
window.exitBtn.click(function () { exit() })
runtime.requestPermissions(['android.permission.RECORD_AUDIO'])
var configPath = "config.json"
var zhipuKey = null
var saveDir = null
var llmUrl = null
var llmKey = null
var llmModel = null
try {
  if (files.exists(configPath)) {
    var cfg = JSON.parse(files.read(configPath))
    zhipuKey = cfg.zhipu_api_key || cfg.zhipi_API || null
    saveDir = cfg.save_dir || null
    llmUrl = cfg.api || null
    llmKey = cfg.apikey || null
    llmModel = cfg.model2 || cfg.model || cfg.model_old || null
  }
} catch (e) {}
if (!zhipuKey) { toast("未配置智普密钥，请在 config.json 设置 zhipu_api_key") }
if (!llmUrl || !llmKey || !llmModel) { toast("未配置大模型接口，请在 config.json 设置 api/apikey/model") }
var recorder = null
var recordPath = null
var isRecording = false
var recordMime = "audio/m4a"
var wavRaf = null
var wavDataBytes = 0
var audioRecord = null
var recordingPCM = false
var pressRecording = false
var lastZhipuMsg = null
var lastModelMsg = null
var wavThread = null
var mainHandler = new android.os.Handler(android.os.Looper.getMainLooper())
function writeLog(s) {
  try {
    var ts = new Date()
    var t = ts.getFullYear() + "-" + ("0"+(ts.getMonth()+1)).slice(-2) + "-" + ("0"+ts.getDate()).slice(-2) + " " + ("0"+ts.getHours()).slice(-2) + ":" + ("0"+ts.getMinutes()).slice(-2) + ":" + ("0"+ts.getSeconds()).slice(-2)
    var line = t + " " + String(s)
    files.append("日志.log", line + "\n")
    try { log(line) } catch (e2) {}
  } catch (e) {}
}
function writeIntLE(raf, v) {
  var bb = java.nio.ByteBuffer.allocate(4).order(java.nio.ByteOrder.LITTLE_ENDIAN)
  bb.putInt(v)
  raf.write(bb.array())
}
function writeShortLE(raf, v) {
  var bb = java.nio.ByteBuffer.allocate(2).order(java.nio.ByteOrder.LITTLE_ENDIAN)
  bb.putShort(v)
  raf.write(bb.array())
}
function writeAscii(raf, s) {
  raf.write(new java.lang.String(s).getBytes("US-ASCII"))
}
function writeWavHeader(raf, dataSize, sampleRate, channels, bits) {
  raf.seek(0)
  writeAscii(raf, "RIFF")
  writeIntLE(raf, 36 + dataSize)
  writeAscii(raf, "WAVE")
  writeAscii(raf, "fmt ")
  writeIntLE(raf, 16)
  writeShortLE(raf, 1)
  writeShortLE(raf, channels)
  writeIntLE(raf, sampleRate)
  var byteRate = sampleRate * channels * (bits / 8)
  writeIntLE(raf, byteRate)
  var blockAlign = channels * (bits / 8)
  writeShortLE(raf, blockAlign)
  writeShortLE(raf, bits)
  writeAscii(raf, "data")
  writeIntLE(raf, dataSize)
}
function ensureDir(dir) {
  try {
    var f = new java.io.File(dir)
    if (!f.exists()) f.mkdirs()
    return f.exists() && f.canWrite()
  } catch (e) { return false }
}
function chooseDir() {
  if (saveDir && ensureDir(saveDir)) return saveDir
  var d = context.getExternalFilesDir(null)
  var p = d ? d.getAbsolutePath() + "/Norma/recordings" : "/sdcard/诺玛/recordings"
  ensureDir(p)
  return p
}
function startRecordWav() {
  try {
    var dir = chooseDir()
    var base = dir + "/rec_" + Date.now()
    recordMime = "audio/wav"
    recordPath = base + ".wav"
    wavRaf = new java.io.RandomAccessFile(recordPath, "rw")
    wavDataBytes = 0
    writeWavHeader(wavRaf, 0, 16000, 1, 16)
    var sampleRate = 16000
    var channelConfig = android.media.AudioFormat.CHANNEL_IN_MONO
    var audioFormat = android.media.AudioFormat.ENCODING_PCM_16BIT
    var minBuf = android.media.AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
    if (minBuf <= 0) {
      try { wavRaf.close() } catch (e0) {}
      wavRaf = null
      return false
    }
    audioRecord = new android.media.AudioRecord(android.media.MediaRecorder.AudioSource.MIC, sampleRate, channelConfig, audioFormat, Math.max(minBuf, 2048))
    if (audioRecord.getState() != android.media.AudioRecord.STATE_INITIALIZED) {
      try { audioRecord.release() } catch (eRel) {}
      audioRecord = null
      try { wavRaf.close() } catch (e0) {}
      wavRaf = null
      return false
    }
    recordingPCM = true
    wavThread = new java.lang.Thread(new java.lang.Runnable({
      run: function () {
        var buf = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, minBuf)
        audioRecord.startRecording()
        while (recordingPCM) {
          var read = audioRecord.read(buf, 0, buf.length)
          if (read > 0) {
            wavRaf.seek(44 + wavDataBytes)
            wavRaf.write(buf, 0, read)
            wavDataBytes += read
          }
        }
        try { audioRecord.stop() } catch (e) {}
        try { audioRecord.release() } catch (e) {}
        audioRecord = null
      }
    }))
    wavThread.start()
    isRecording = true
    return true
  } catch (e) {
    try { if (audioRecord) audioRecord.release() } catch (e2) {}
    try { if (wavRaf) wavRaf.close() } catch (e3) {}
    audioRecord = null
    wavRaf = null
    wavDataBytes = 0
    return false
  }
}
function stopRecordWav() {
  try {
    recordingPCM = false
    try {
      if (wavThread) {
        wavThread.join(800)
      }
    } catch (e) {}
    wavThread = null
    if (wavRaf) {
      writeWavHeader(wavRaf, wavDataBytes, 16000, 1, 16)
      wavRaf.close()
      wavRaf = null
    }
    isRecording = false
    return recordPath
  } catch (e) {
    try { if (wavRaf) wavRaf.close() } catch (e2) {}
    wavRaf = null
    isRecording = false
    return null
  }
}
function startRecording() {
  try {
    if (startRecordWav()) return true
    var dir = chooseDir()
    var base = dir + "/rec_" + Date.now()
    recordMime = "audio/m4a"
    recordPath = base + ".m4a"
    recorder = new android.media.MediaRecorder()
    recorder.setAudioSource(android.media.MediaRecorder.AudioSource.MIC)
    recorder.setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4)
    recorder.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC)
    recorder.setOutputFile(recordPath)
    recorder.prepare()
    recorder.start()
    isRecording = true
    return true
  } catch (e) {
    try {
      isRecording = false
      try { if (recorder) recorder.release() } catch (e2) {}
      recorder = null
      var dir = chooseDir()
      var base = dir + "/rec_" + Date.now()
      recordMime = "audio/3gpp"
      recordPath = base + ".3gp"
      recorder = new android.media.MediaRecorder()
      recorder.setAudioSource(android.media.MediaRecorder.AudioSource.MIC)
      recorder.setOutputFormat(android.media.MediaRecorder.OutputFormat.THREE_GPP)
      recorder.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AMR_NB)
      recorder.setOutputFile(recordPath)
      recorder.prepare()
      recorder.start()
      isRecording = true
      return true
    } catch (e2) {
      isRecording = false
      try { if (recorder) recorder.release() } catch (e3) {}
      recorder = null
      window.status.setText("开始录音失败")
      log("开始录音失败: " + e + " | 回退失败: " + e2)
      toast("开始录音失败")
      return false
    }
  }
}
function stopRecording() {
  try {
    if (wavRaf || recordingPCM) {
      var p = stopRecordWav()
      return p
    } else {
      if (recorder) {
        recorder.stop()
        recorder.reset()
        recorder.release()
        recorder = null
      }
      isRecording = false
      return recordPath
    }
  } catch (e) {
    isRecording = false
    try { if (recorder) recorder.release() } catch (e2) {}
    recorder = null
    writeLog("停止录音失败")
    return null
  }
}
function transcribeWithZhipu(path) {
  if (!zhipuKey) return null
  try {
    try {
      var fsz = new java.io.File(path).length()
      if (fsz < 800) {
        lastZhipuMsg = "音频过短(" + fsz + "字节)"
        return null
      }
    } catch (e) {}
    var urlStr = "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions"
    var boundary = "----AutoJSFormBoundary" + Date.now()
    var url = new java.net.URL(urlStr)
    var conn = url.openConnection()
    conn.setDoOutput(true)
    conn.setDoInput(true)
    conn.setRequestMethod("POST")
    try { conn.setConnectTimeout(30000) } catch (e) {}
    try { conn.setReadTimeout(60000) } catch (e) {}
    conn.setRequestProperty("Authorization", "Bearer " + zhipuKey)
    conn.setRequestProperty("Accept", "application/json")
    conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary)
    var out = new java.io.DataOutputStream(conn.getOutputStream())
    function writeField(name, value) {
      out.writeBytes("--" + boundary + "\r\n")
      out.writeBytes("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n")
      out.writeBytes(String(value) + "\r\n")
    }
    function writeFile(name, filename, filepath, mimetype) {
      out.writeBytes("--" + boundary + "\r\n")
      out.writeBytes("Content-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\n")
      out.writeBytes("Content-Type: " + mimetype + "\r\n\r\n")
      var fis = new java.io.FileInputStream(filepath)
      var buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 4096)
      var len
      while ((len = fis.read(buffer)) > 0) {
        out.write(buffer, 0, len)
      }
      fis.close()
      out.writeBytes("\r\n")
    }
    writeField("model", "glm-asr-2512")
    writeField("stream", "false")
    writeField("response_format", "text")
    writeField("language", "zh")
    writeFile("file", new java.io.File(path).getName(), path, recordMime || "application/octet-stream")
    out.writeBytes("--" + boundary + "--\r\n")
    out.flush()
    out.close()
    var code = conn.getResponseCode()
    var is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream()
    var br = new java.io.BufferedReader(new java.io.InputStreamReader(is))
    var sb = new java.lang.StringBuilder()
    var line
    while ((line = br.readLine()) != null) { sb.append(line) }
    br.close()
    var resp = String(sb.toString())
    try {
      var obj = JSON.parse(resp)
      var text = obj.text || obj.result || obj.output_text || null
      if (text) return text
      var err = obj.error || obj.message || null
      if (err) {
        lastZhipuMsg = typeof err === "string" ? err : (err.message || JSON.stringify(err))
      } else {
        lastZhipuMsg = "HTTP " + code
      }
    } catch (e) {}
    writeLog("智普识别响应: " + resp)
    return null
  } catch (e) {
    writeLog("智普识别失败: " + e)
    try { lastZhipuMsg = String(e) } catch (e2) {}
    return null
  }
}
function readSystemPrompt() {
  try {
    var p = "系统提示词.txt"
    if (files.exists(p)) return files.read(p)
    return "你是助手，只返回JSON。工具：sendWX(tarName,message)。根据识别文本生成函数调用。"
  } catch (e) { return "你是助手，只返回JSON。工具：sendWX(tarName,message)。" }
}
function extractJsonFromText(txt) {
  try {
    if (!txt) return null
    var s = String(txt).trim()
    s = s.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
    try { return JSON.parse(s) } catch (e1) {}
    var start = s.indexOf("{")
    var end = -1
    if (start >= 0) {
      var depth = 0
      for (var i = start; i < s.length; i++) {
        var ch = s.charAt(i)
        if (ch == "{") depth++
        else if (ch == "}") {
          depth--
          if (depth == 0) { end = i; break }
        }
      }
      if (end >= start) {
        var sub = s.substring(start, end + 1)
        try { return JSON.parse(sub) } catch (e2) {}
      }
    }
    return null
  } catch (e) { return null }
}
function callModel(text) {
  if (!llmUrl || !llmKey || !llmModel) return null
  var sys = readSystemPrompt()
  var payload = {
    model: llmModel,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: String(text) }
    ],
    response_format: { type: "json_object" }
  }
  var headers = {
    Authorization: "Bearer " + llmKey,
    "Content-Type": "application/json",
    Accept: "application/json",
    "HTTP-Referer": "http://localhost",
    "X-Title": "Norma-Voice2WX"
  }
  var lastError = null
  var lastStatus = null
  var lastBodyStr = null
  var responseText = null
  for (var i = 0; i < 3; i++) {
    try {
      var res = null
      try {
        res = http.postJson(llmUrl, payload, { headers: headers, timeout: 30000 })
        var code = res.statusCode
        var bodyStr = res.body.string()
        if (code >= 500) {
          lastStatus = code
          lastBodyStr = bodyStr
          sleep(Math.pow(2, i) * 1000)
          continue
        }
        responseText = bodyStr
        try { writeLog("模型HTTP响应: " + responseText) } catch (eLog) {}
        break
      } finally {
        try {
          if (res && res.body && res.body.close) res.body.close()
        } catch (e2) {}
      }
    } catch (e) {
      lastError = e
      sleep(Math.pow(2, i) * 1000)
    }
  }
  if (responseText == null) {
    lastModelMsg = lastError ? String(lastError) : ("HTTP状态: " + lastStatus + (lastBodyStr ? (", 响应: " + lastBodyStr) : ""))
    return null
  }
  var obj = null
  try {
    var parsed = JSON.parse(responseText)
    var content = null
    try {
      content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content
    } catch (e) { content = null }
    if (content && typeof content === "string") {
      obj = extractJsonFromText(content)
    }
    if (!obj && parsed.choices && parsed.choices[0]) {
      var raw = parsed.choices[0].message && parsed.choices[0].message.content
      obj = extractJsonFromText(raw)
    }
    if (!obj) {
      obj = extractJsonFromText(responseText)
    }
  } catch (e) {
    try {
      obj = extractJsonFromText(responseText)
    } catch (e2) {
      lastModelMsg = "解析失败: " + e2
      obj = null
    }
  }
  try {
    if (obj) { writeLog("解析后JSON: " + JSON.stringify(obj)) }
  } catch (eJ) {}
  return obj
}
function findAndClickTemplate(path, offsetX, offsetY, threshold){
  threshold = threshold || 0.8
  var tmpl = images.read(path)
  if (!tmpl) return false
  for (var i = 0; i < 8; i++) {
    var img = captureScreen()
    var p = images.findImage(img, tmpl, { threshold: threshold })
    if (p) {
      var x = p.x + Math.floor(tmpl.getWidth() / 2) + (offsetX || 0)
      var y = p.y + Math.floor(tmpl.getHeight() / 2) + (offsetY || 0)
      x = Math.max(0, Math.min(device.width - 1, x))
      y = Math.max(0, Math.min(device.height - 1, y))
      click(x, y)
      sleep(500)
      return true
    }
    sleep(300)
  }
  return false
}
function clickCenterTemplate(fileName, tries, threshold) {
  tries = tries || 8
  threshold = threshold || 0.8
  var tmpl = images.read(files.path(fileName))
  if (!tmpl) return false
  for (var i = 0; i < tries; i++) {
    var img = captureScreen()
    var p = images.findImage(img, tmpl, { threshold: threshold })
    if (p) {
      var x = p.x + Math.floor(tmpl.getWidth() / 2)
      var y = p.y + Math.floor(tmpl.getHeight() / 2)
      x = Math.max(0, Math.min(device.width - 1, x))
      y = Math.max(0, Math.min(device.height - 1, y))
      click(x, y)
      sleep(400)
      return true
    }
    sleep(300)
  }
  return false
}
function pasteWithImages(text) {
  setClip(text)
  sleep(400)
  clickCenterTemplate("文字编辑.jpg", 10, 0.78)
  sleep(300)
  clickCenterTemplate("粘贴.jpg", 10, 0.78)
}
function clickAtRelative(xRate, yRate) {
  var x = Math.floor(device.width * xRate)
  var y = Math.floor(device.height * yRate)
  click(x, y)
}
function ensureOnHome(maxTries) {
  maxTries = maxTries || 20
  for (var i = 0; i < maxTries; i++) {
    var act = currentActivity()
    if (act == "com.tencent.mm.ui.LauncherUI") return true
    back()
    sleep(500)
  }
  return currentActivity() == "com.tencent.mm.ui.LauncherUI"
}
function ensureSearchClicked(maxTries) {
  maxTries = maxTries || 30
  for (var i = 0; i < maxTries; i++) {
    var tmpl = images.read(files.path("搜索图标.jpg"))
    if (tmpl) {
      var img = captureScreen()
      var p = images.findImage(img, tmpl, { threshold: 0.78 })
      if (p) {
        var x = p.x + Math.floor(tmpl.getWidth() / 2)
        var y = p.y + Math.floor(tmpl.getHeight() / 2)
        click(x, y)
        sleep(400)
        return true
      }
    }
    back()
    sleep(500)
  }
  return false
}
function sendWX(tarName, message) {
  app.launch("com.tencent.mm")
  sleep(800)
  writeLog("打开微信")
  ensureOnHome(20)
  ensureSearchClicked(30)
  pasteWithImages(tarName)
  writeLog("粘贴联系人: " + tarName)
  sleep(600)
  clickAtRelative(0.1, 0.2)
  waitForActivity("com.tencent.mm.ui.chatting.ChattingUI")
  sleep(800)
  var okInput = findAndClickTemplate(files.path("发送图标.jpg"), 150, 0, 0.8)
  if (!okInput) { clickCenterTemplate("发送图标.jpg", 10, 0.78) }
  sleep(300)
  pasteWithImages(message)
  writeLog("粘贴消息: " + message)
  sleep(300)
  clickCenterTemplate("发送.jpg", 10, 0.78)
  writeLog("完成发送")
}
function handleLLMResult(obj) {
  try {
    if (!obj) return false
    var fn = null
    var params = null
    if (obj.tool && !obj.functionName) { fn = obj.tool }
    if (obj.functionName) {
      fn = typeof obj.functionName === "object" && obj.functionName && obj.functionName.value ? obj.functionName.value : obj.functionName
    }
    if (obj.params) {
      params = obj.params
    }
    if (!fn && obj.tools && obj.tools[0]) {
      var t0 = obj.tools[0]
      var f0 = t0.functionName
      fn = typeof f0 === "object" && f0 && f0.value ? f0.value : f0
      params = t0.params || params
    }
    if (!params && obj.arguments) {
      try { params = typeof obj.arguments === "string" ? JSON.parse(obj.arguments) : obj.arguments } catch (eA) {}
    }
    if (!params && obj.param) { params = obj.param }
    var tar = null
    var msg = null
    if (params) {
      tar = params.tarName || params.target || params.name || params.contact || params.to || null
      msg = params.message || params.text || params.content || null
    }
    if (!tar) { tar = obj.tarName || obj.target || obj.name || obj.contact || obj.to || null }
    if (!msg) { msg = obj.message || obj.text || obj.content || null }
    if (String(fn).toLowerCase() == "sendwx" && tar && msg) {
      writeLog("执行指令 sendWX: " + tar + " | " + msg)
      sendWX(String(tar), String(msg))
      return true
    }
    return false
  } catch (e) { return false }
}
function transcribeAndCall(textPath) {
  threads.start(function () {
    try {
      var txt = transcribeWithZhipu(textPath)
      if (txt) { writeLog("识别完成: " + txt) } else { writeLog("识别失败: " + (lastZhipuMsg || "")) }
      if (!txt) return
      var obj = callModel(txt)
      if (!obj && files.exists("模型回复.json")) {
        try {
          var s = files.read("模型回复.json")
          obj = JSON.parse(s)
          writeLog("读取本地模型回复: " + s)
        } catch (eL) { writeLog("读取本地模型回复失败: " + eL) }
      }
      if (obj) { writeLog("模型返回: " + JSON.stringify(obj)) } else { writeLog("模型失败: " + (lastModelMsg || "")) }
      if (obj) {
        handleLLMResult(obj)
      } else {
        writeLog("未获取到可执行的模型指令")
      }
    } catch (e) {
      writeLog("流程异常: " + e)
    }
  })
}
window.recordBtn.on("touch_down", function () {
  try {
    if (!isRecording) {
      pressRecording = true
      writeLog("开始录音")
      startRecording()
    }
  } catch (e) {
    writeLog("触摸按下异常: " + e)
  }
})
window.recordBtn.on("touch_up", function () {
  try {
    if (pressRecording) {
      pressRecording = false
      var p = stopRecording()
      if (!p) {
        writeLog("录音失败")
        return
      }
      writeLog("结束录音，开始识别")
      transcribeAndCall(p)
    }
  } catch (e) {
    writeLog("触摸抬起异常: " + e)
  }
})
events.on("exit", function () {
  try {
    if (isRecording) { try { recorder.stop() } catch (e) {} }
    try { if (recorder) recorder.release() } catch (e) {}
    recorder = null
  } catch (e) {}
  try {
    recordingPCM = false
    try { if (audioRecord) audioRecord.stop() } catch (e2) {}
    try { if (audioRecord) audioRecord.release() } catch (e3) {}
    audioRecord = null
    try { if (wavRaf) wavRaf.close() } catch (e4) {}
    wavRaf = null
  } catch (e) {}
  try { window.close() } catch (e) {}
})
for (;;) { sleep(1000) }
