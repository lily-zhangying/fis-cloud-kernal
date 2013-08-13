var net = require("net"),
	http = require("http"),
    express = require("express"),
    domain = require("domain");
    app = express();

app.use(function(req, res, next){
    var d = domain.create();
    //监听domain的错误事件
    d.on('error', function(er) {
        //todo 异常处理需要完善
        console.error('error', er.stack);
        res.statusCode = 500;
        res.setHeader('content-type', 'text/plain');
        res.end('Oops, there was a problem!\n');
        process.disconnect();
        process.exit();
    });
    d.add(req);
    d.add(res);
    d.run(next);
});

app.all("*", handleRequest);

//express会首先捕获异常，导致domain无法捕获，所以这里使用nextTick跳出express的stack
function handleRequest(req, res){
    process.nextTick(function(){
        //这里写正常处理逻辑
        process.disconnect();
        process.exit();
    });
}

server = http.createServer(app);

function handleMessage(self, handle){
    //测试这里是否可以通过设置server的最大连接数为1，完成功能？
    var socket = new net.Socket({
        handle : handle,
        allowHalfOpen : self.allowHalfOpen
    });
    socket.readable = socket.writable = true;
    socket.resume();
    socket.server = self;
    self.emit("connection", socket);
    socket.emit("connect");
}


process.on("message", function(m ,handle){
    if(handle){
        handleMessage(server, handle);
    }
}); 