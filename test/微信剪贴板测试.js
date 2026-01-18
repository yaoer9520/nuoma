auto.waitFor()
if(!requestScreenCapture()){ toast("请求截图失败"); exit() }
var targetName = rawInput("输入目标名字")
var messageText = rawInput("输入要发送的消息")
app.launch("com.tencent.mm")
sleep(800)
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
ensureOnHome(20)
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
function pasteText() {
  var text = getClip()
  var input = className("android.widget.EditText").editable(true).findOne(1500)
  if (!input) input = className("EditText").findOne(1500)
  if (!input) return false
  try { input.click() } catch (e) {}
  sleep(300)
  var b = input.bounds()
  press(b.centerX(), b.centerY(), 1000)
  sleep(500)
  var pasteBtn = text("粘贴").findOne(800)
  if (!pasteBtn) pasteBtn = textContains("Paste").findOne(800)
  if (pasteBtn) {
    try { pasteBtn.click() } catch (e2) {}
    return true
  } else {
    try { input.setText(text) } catch (e3) {}
    return false
  }
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
function clickFirstResultByName(name) {
  var node = text(name).findOne(1500)
  if (!node) node = desc(name).findOne(1500)
  if (node) {
    var clickable = node
    for (var i = 0; i < 8 && clickable && !clickable.clickable(); i++) {
      clickable = clickable.parent()
    }
    if (clickable && clickable.clickable()) {
      try { clickable.click(); return true } catch (e) {}
    }
    var b1 = node.bounds()
    click(b1.centerX(), b1.centerY())
    return true
  }
  var list = className("android.widget.ListView").findOne(800)
  if (!list) list = className("androidx.recyclerview.widget.RecyclerView").findOne(800)
  if (list && list.childCount() > 0) {
    try {
      var item = list.child(0)
      var b = item.bounds()
      click(b.centerX(), b.centerY())
      return true
    } catch (e) {}
  }
  return false
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
ensureOnHome(10)
ensureSearchClicked(30)
pasteWithImages(targetName)
toast("已复制目标名字")
sleep(600)
clickAtRelative(0.1, 0.2)
waitForActivity("com.tencent.mm.ui.chatting.ChattingUI")
sleep(800)
var okInput = findAndClickTemplate(files.path("发送图标.jpg"), 150, 0, 0.8)
if (!okInput) { clickCenterTemplate("发送图标.jpg", 10, 0.78) }
sleep(300)
pasteWithImages(messageText)
toast("已复制消息内容")
sleep(300)
clickCenterTemplate("发送.jpg", 10, 0.78)
