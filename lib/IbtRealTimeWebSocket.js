var WebSocket = require('ws');

function IbtRealTimeWebSocket(url){
    this.socket=null;
    this.url= url?url:null;
};

IbtRealTimeWebSocket.prototype.connection = function connection(){
    if(this.socket && (this.socket.readyState==WebSocket.OPEN || this.socket.readyState==WebSocket.CONNECTING )){
        return this.socket;
    }else if(this.url){
        this.socket = new WebSocket(this.url);
        this.socket.isConnected = function isConnected(){
            return this.socket && this.socket.readyState==WebSocket.OPEN ? true:false;
        }
        return this.socket;
    }
}

module.exports = IbtRealTimeWebSocket;
