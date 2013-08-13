
var childs = [],
    usedWorkers = [],
    WORKER_NUMBER = 20,
    last_child_pos = 0,
    cp = require("child_process"),
    TCP = process.binding("tcp_wrap").TCP;


function createWorker(){
  var worker = cp.fork("./work.js");
  worker.on("exit", handleWorkerClose);
  return worker;
}

function handleWorkerClose(){
console.log("handle worker close");
  for(var i=usedWorkers.length; i>0; i--){
    var worker = createWorker();
    childs[usedWorkers.pop()] = worker;
  }
}

function handleWorkerError(err){
console.log("handle worker error");
            
}

function onconnection(handle){
console.log("get a connection");
    last_child_pos++;
    if(last_child_pos >= WORKER_NUMBER){
      last_child_pos = 0;
    }
console.log("child " + last_child_pos + " process the connection.");
    childs[last_child_pos].send({"handle" : true}, handle);
    usedWorkers.push(last_child_pos);
    handle.close();
}

function startServer(address, port){
console.log("starting a server");
    server = new TCP();
    //todo 需要检测端口是否已经开启，提醒报错
    server.bind(address, port);
    server.onconnection = onconnection;
    server.listen(1023);
}

function startWorker(){
  for(var i=0; i<WORKER_NUMBER; i++){
    var worker = createWorker();
    childs.push(worker);
  }
}


var port = 3459,
    address = "0.0.0.0";

startWorker();
startServer(address, port);

