var OrtcNodeclient = require('ibtrealtimesjnode').IbtRealTimeSJNode;

var connectionUrl = 'http://ortc-developers.realtime.co/server/2.1';

var appKey = 'YOUR_APPLICATION_KEY';
var authToken = 'AUTHENTICATION_TOKEN';
var channel = 'MyChannel';
var privateKey = 'YOUR_APPLICATION_PRIVATE_KEY';
var isCluster = false;
var authenticationRequired = false;
var connectionMetadata = 'Node.js sample with guaranteed delivery';

// This id should be unique for each subscriber (e.g. the user id in your app context)
var subscriberId = "this-subscribed-id";

var client = new OrtcNodeclient();

var countMsgChannel = 0;

/***********************************************************
* Client sets
***********************************************************/
isCluster ? client.setClusterUrl(connectionUrl) : client.setUrl(connectionUrl);

client.setConnectionMetadata(connectionMetadata);

/***********************************************************
* Client callbacks
***********************************************************/

client.onConnected = clientConnected;
client.onSubscribed = clientSubscribed;
client.onUnsubscribed = clientUnsubscribed;
client.onReconnecting = clientReconnecting;
client.onReconnected = clientReconnected;
client.onDisconnected = clientDisconnected;
client.onException = clientException;

/***********************************************************
* Client methods
***********************************************************/

if(authenticationRequired){
	// Enable presence data for MyChannel
	client.enablePresence({
		applicationKey : appKey,
		channel : channel, 
		privateKey : privateKey, 
		url : connectionUrl,
		isCluster : isCluster,
		metadata : 1
	},
	function(error,result){
		if(error){
			log('Enable presence error: ' + error);  
		}else{
			log('Presence enable: ' + result);              
		}
	});
}	

function clientConnected(ortc) {
    log('Connected to: ' + ortc.getUrl());
    log('Subscribe to channel: ' + channel);


    setInterval(function(){
		// Get presence data for channel
		log('Retrieving presence data for channel: ' + channel);
        client.presence({
            authenticationToken : authToken,
            applicationKey : appKey,
            channel : channel,  
            url : connectionUrl,
            isCluster : isCluster
        },
        function(error,result){
            if(error){
                console.log('Presence error:',error);
            }else{
                if(result){
                    console.log('Subscriptions',result.subscriptions);  

                    for(var metadata in result.metadata){
                        console.log(metadata,'-',result.metadata[metadata]);                                    
                    }
                }else{
                    console.log('Subscriptions empty'); 
                }                           
            }
        }); 
    },15 * 1000);

    // subscribe the channel using a buffer for message guaranteed delivery
    ortc.subscribeWithBuffer(channel, subscriberId, function(ortc, channel, seqId, message) {
        // seqId contains the message unique sequence id in the channel
        log('Received: ' + message + ' at channel: ' + channel + ' with seqId: ' + seqId);
    });
};

function clientSubscribed(ortc, channel) {
    log('Subscribed to channel: ' + channel);
};

function clientUnsubscribed(ortc, channel) {
    log('Unsubscribed from channel: ' + channel);
};

function clientReconnecting(ortc) {
    log('Reconnecting to ' + connectionUrl);
};

function clientReconnected(ortc) {
    log('Reconnected to: ' + ortc.getUrl());
};

function clientDisconnected(ortc) {
    log('Disconnected');
};

function clientException(ortc, error) {
    log('Error: ' + error);
};

/***********************************************************
* Aux methods
***********************************************************/

function log(text, isSameLine) {
    if (text) {
        var currTime = new Date();

        text = currTime + ' - ' + text;
    }

    if (isSameLine) {
        process.stdout.write(text);
    }
    else {
        console.log(text);
    }
};

if(authenticationRequired){
	log('Authenticating to ' + connectionUrl);
		
	var permissions = {};
	// Give permission to read, write and obtain presence data
	permissions[channel] = 'wrp';

	// Authenticate the user token 
	client.saveAuthentication(connectionUrl,isCluster,authToken,false,appKey,1800,privateKey,permissions,function(error,result){
		if(error){
			log('Authentication Error: ' + error);
		}else{
			log('Authenticated to ' + connectionUrl);
			log('Connecting to ' + connectionUrl);
			// Connect to the Realtime Framework cluster
			client.connect(appKey, authToken);
		}
	});
}else{
	log('Connecting to ' + connectionUrl);
	// Connect to the Realtime Framework cluster
	client.connect(appKey, authToken);
}


// Send a message to the subscribed channel every second
var sendInterval = setInterval(function sendMessage() {
    if (client.getIsConnected() == true) {
        var message = {
            a: 31,
            b: 2,
            m: "Hello world"
        };

        var messageStr = JSON.stringify(message);

        log('Publishing: ' + messageStr + ' to channel: ' + channel);

        // publish message with delivery guarantee
        client.publish(channel, messageStr, 0, function(err, seqId) {
            if(err) {
                log('Error publishing: ' + messageStr + ' to channel: ' + channel + ' Error: '+ err);
            } else {
                // seqId contains the message unique sequence id in the channel
                log('Published: ' + messageStr + ' to channel: ' + channel + ' with seqId: ' + seqId); 
            }
        });
    }
}, 1000);
