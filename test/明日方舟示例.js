var window = floaty.window( 
  <frame> 
    <button id="stopButton" text="停止" textSize="16sp" textColor="#ffffff" bg="#000000" gravity="center"/> 
  </frame> ); window.setSize(200, 200); // 设置悬浮窗的大小 
window.setPosition(100, 100); // 设置悬浮窗的位置 // 设置停止按钮的点击事件 
window.stopButton.click(() => { 
  toast("程序已停止！"); 
  exit(); // 退出程序 
}); // 在脚本结束时移除悬浮窗 

events.on("exit", () => { window.close(); }); 

launchApp("明日方舟"); 
sleep(5000); 
var begin1 = images.read("开始1.jpg");
var begin2 = images.read("开始2.jpg"); 
var end = images.read("结束.jpg");
if (begin1 && begin2 && end) { 
  toastLog("图片加载成功！"); // 在这里可以进行其他操作，比如显示图片等 
} else { 
  toastLog("图片加载失败！"); 
}

for (var i = 0; i < 10000; i++) { // 在这里编写需要重复执行的代码 
  requestScreenCapture();  
  sleep(3000); 
  var p = findImage(captureScreen(), begin1); 
  if (p) {     
    toastLog("找到了，坐标：" + p.x + "----" + p.y);     
    click(p.x+18, p.y+20);//点击坐标 
    sleep(1000); 
  } else { 
    toastLog("未找到"); 
  }
  
  var p = findImage(captureScreen(), begin2); 
  if (p) {     
    toastLog("找到了，坐标：" + p.x + "----" + p.y);     
    click(p.x+18, p.y+20);//点击坐标 
    sleep(1000*60); 
  } else { 
    toastLog("未找到"); 
  }
  sleep(1000);
  var p = findImage(captureScreen(), end); 
  if (p) {     
    toastLog("找到了，坐标：" + p.x + "----" + p.y);     
    click(p.x+18, p.y+20);//点击坐标 
    sleep(1000); 
  } else { 
    toastLog("未找到"); 
  }
  sleep(1000);     
}
exit();