console.show()
const CONFIG_PATH = "config.json"
if (!files.exists(CONFIG_PATH)) {
  dialogs.alert("错误", "未找到配置文件")
  exit()
}
const config = JSON.parse(files.read(CONFIG_PATH))
const url = config.api
const apiKey = config.apikey
const model = config.model2
const payload = {
  model: model,
  messages: [
    { role: "user", content: "我正在测试API是否成功，回复'收到'即可" }
  ]
}
const headers = {
  Authorization: "Bearer " + apiKey,
  "Content-Type": "application/json",
  Accept: "application/json",
  "HTTP-Referer": "http://localhost",
  "X-Title": "Norma-Test"
}
let responseText = null
let lastError = null
let lastStatus = null
let lastBodyStr = null
for (let i = 0; i < 3; i++) {
  try {
    let res = null
    try {
      res = http.postJson(url, payload, { headers: headers, timeout: 30000 })
      const code = res.statusCode
      const bodyStr = res.body.string()
      if (code >= 500) {
        lastStatus = code
        lastBodyStr = bodyStr
        sleep(Math.pow(2, i) * 1000)
        continue
      }
      responseText = bodyStr
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
  const msg = lastError ? String(lastError) : ("HTTP状态: " + lastStatus + (lastBodyStr ? (", 响应: " + lastBodyStr) : ""))
  log("请求失败: " + msg)
  dialogs.alert("请求失败", msg)
  exit()
}
let obj = null
try {
  obj = JSON.parse(responseText)
} catch (e) {
  log("非JSON响应: " + responseText)
  dialogs.alert("非JSON响应", responseText)
  exit()
}
let reply = null
try {
  reply = obj.choices && obj.choices[0] && obj.choices[0].message && obj.choices[0].message.content
} catch (e) {
  reply = null
}
if (!reply) {
  reply = responseText
}
log("模型回复: " + reply)
dialogs.alert("模型回复", reply)
