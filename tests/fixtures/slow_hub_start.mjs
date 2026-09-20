// 重现CI竞态：有启动日志不等于HTTP端口已经开始监听。
console.log('[test] 正在初始化，服务尚未就绪');
await new Promise(resolve => setTimeout(resolve, 120));
