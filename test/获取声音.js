var Settings = android.provider.Settings
var Uri = android.net.Uri
if (!Settings.canDrawOverlays(context)) {
  var intent = new android.content.Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.getPackageName()))
  intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
  context.startActivity(intent)
  toast("请授予悬浮窗权限后返回重新运行")
  exit()
}
var window = floaty.window(
  <vertical padding="16" bg="#AA000000">
    <text id="title" text="智普语音转文字" textSize="18sp" textColor="#ffffff"/>
    <button id="recordBtn" text="开始录音" textSize="24sp" h="100dp" w="*"/>
    <text id="status" text="就绪" textSize="16sp" textColor="#cccccc"/>
    <text id="result" text="结果将显示在这里" textSize="16sp" textColor="#ffffff"/>
    <button id="exitBtn" text="退出" textSize="16sp"/>
  </vertical>
)
var w = Math.max(600, Math.floor(device.width * 0.92))
var h = Math.max(480, Math.floor(device.height * 0.5))
window.setSize(w, h)
try {
  var x = Math.max(0, (device.width - w) / 2)
  var y = Math.max(0, (device.height - h) / 2)
  window.setPosition(x, y)
} catch (e) {
  window.setPosition(100, 300)
}
setInterval(function(){}, 1000)
window.exitBtn.click(function () { exit() })
runtime.requestPermissions(['android.permission.RECORD_AUDIO'])
var configPath = "config.json"
var zhipuKey = null
var saveDir = null
try {
  if (files.exists(configPath)) {
    var cfg = JSON.parse(files.read(configPath))
    zhipuKey = cfg.zhipu_api_key || cfg.zhipi_API || null
    saveDir = cfg.save_dir || null
  }
} catch (e) {}
if (!zhipuKey) {
  toast("未配置智普密钥，请在 test/config.json 设置 zhipu_api_key")
}
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
var wavThread = null
var mainHandler = new android.os.Handler(android.os.Looper.getMainLooper())
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
function startRecordWav() {
  try {
    var dir = chooseDir()
    var base = dir + "/rec_" + Date.now()
    recordMime = "audio/wav"
    recordPath = base + ".wav"
    wavRaf = new java.io.RandomAccessFile(recordPath, "rw")
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
    toast("停止录音失败")
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
    log("智普识别响应: " + resp)
    return null
  } catch (e) {
    log("智普识别失败: " + e)
    try { lastZhipuMsg = String(e) } catch (e2) {}
    return null
  }
}
function transcribeAsync(p) {
  threads.start(function () {
    try {
      var txt = transcribeWithZhipu(p)
      mainHandler.post(new java.lang.Runnable({
        run: function () {
          if (txt) {
            window.result.setText(String(txt))
            window.status.setText("识别完成")
          } else {
            window.result.setText("识别失败")
            window.status.setText(lastZhipuMsg ? "失败: " + String(lastZhipuMsg) : "失败")
          }
        }
      }))
    } catch (e) {
      mainHandler.post(new java.lang.Runnable({
        run: function () {
          window.result.setText("识别失败")
          window.status.setText(String(e))
        }
      }))
    }
  })
}
window.recordBtn.click(function () {
  try {
    if (pressRecording) return
    if (!isRecording) {
      window.status.setText("正在录音...")
      window.recordBtn.setText("停止并识别")
      startRecording()
    } else {
      var p = stopRecording()
      if (!p) {
        window.status.setText("录音失败")
        return
      }
      window.status.setText("正在识别...")
      window.recordBtn.setText("开始录音")
      transcribeAsync(p)
    }
  } catch (e) {
    log("按钮处理异常: " + e)
  }
})
window.recordBtn.on("touch_down", function () {
  try {
    if (!isRecording) {
      pressRecording = true
      window.status.setText("正在录音...")
      window.recordBtn.setText("松手识别")
      startRecording()
    }
  } catch (e) {
    log("触摸按下异常: " + e)
  }
})
window.recordBtn.on("touch_up", function () {
  try {
    if (pressRecording) {
      pressRecording = false
      var p = stopRecording()
      if (!p) {
        window.status.setText("录音失败")
        return
      }
      window.status.setText("正在识别...")
      window.recordBtn.setText("开始录音")
      transcribeAsync(p)
    }
  } catch (e) {
    log("触摸抬起异常: " + e)
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
