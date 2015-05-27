var WebSocket = require('ws'),
    httpRequest = require('./http-request'),
    urlParser = require('url'),
    strings = require('./strings'),
    fs = require('fs'),
    path = require('path'),
    ObjectLiterals = require('./object-literals'),
    IbtRealtimeRestServices = require('./IbtRealtimeRestServices'),
    IbtRealTimeWebSocket = require('./IbtRealTimeWebSocket');

exports = module.exports = IbtRealTimeSJNode;

/*
* Initializes a new instance of the IbtRealTimeSJNode class.
*/
function IbtRealTimeSJNode() {

    /***********************************************************
    * @attributes 
    ***********************************************************/

    var appKey;                     // application key
    var authToken;                  // authentication token
    var clusterUrl;                 // cluster URL to connect
    var connectionTimeout;          // connection timeout in milliseconds
    var messageMaxSize;             // message maximum size in bytes
    var channelMaxSize;             // channel maximum size in bytes
    var messagesBuffer;             // buffer to hold the message parts
    var id;                         // object identifier
    var isConnected;                // indicates whether the client object is connected
    var isConnecting;               // indicates whether the client object is connecting
    var alreadyConnectedFirstTime;  // indicates whether the client already connected for the first time
    var stopReconnecting;           // indicates whether the user disconnected (stop the reconnecting proccess)
    var ortc;                       // represents the object itself
    var reconnectIntervalId;        // id used for the reconnect interval
    var reconnectTimeoutlId;        // id used for the reconnect timeout
    var sockjs;                     // socket connected to
    var url;                        // URL to connect
    var userPerms;                  // user permissions
    var connectionMetadata;         // connection metadata used to identify the client
    var announcementSubChannel;     // announcement subchannel
    var subscribedChannels;         // subscribed/subscribing channels
    var lastKeepAlive;              // holds the time of the last keep alive received
    var invalidConnection;          // indicates whether the connection is valid
    var reconnectStartedAt;         // the time which the reconnect started
    var eventEmitter;               // event emitter to send message
   

    /***********************************************************
    * @attributes initialization
    ***********************************************************/

    connectionTimeout = 15000;
    messageMaxSize = 800;
    channelMaxSize = 100;
    connectionMetadataMaxSize = 256;

    messagesBuffer = Object.create(null);
    subscribedChannels = Object.create(null);

    isConnected = false;
    isConnecting = false;
    alreadyConnectedFirstTime = false;
    invalidConnection = false;

    ortc = this;
    lastKeepAlive = null;
    userPerms = null;
    reconnectStartedAt = null;
    
    this.eventEmitter = new process.EventEmitter();

    /***********************************************************
    * @properties
    ***********************************************************/

    this.getId = function () { return id; };
    this.setId = function (newId) { id = newId; };

    this.getUrl = function () { return url; };
    this.setUrl = function (newUrl) { url = newUrl; clusterUrl = null; };

    this.getClusterUrl = function () { return clusterUrl; };
    this.setClusterUrl = function (newUrl) { clusterUrl = newUrl; url = null; };

    this.getConnectionTimeout = function () { return connectionTimeout; };
    this.setConnectionTimeout = function (newTimeout) { connectionTimeout = newTimeout; };

    this.getIsConnected = function () { return isConnected && ortc.sockjs != null; };

    this.getConnectionMetadata = function () { return connectionMetadata; };
    this.setConnectionMetadata = function (newConnectionMetadata) { connectionMetadata = newConnectionMetadata; };

    this.getAnnouncementSubChannel = function () { return announcementSubChannel; };
    this.setAnnouncementSubChannel = function (newAnnouncementSubChannel) { announcementSubChannel = newAnnouncementSubChannel; };

    /***********************************************************
    * @events
    ***********************************************************/

    this.onConnected = null;
    this.onDisconnected = null;
    this.onSubscribed = null;
    this.onUnsubscribed = null;
    this.onException = null;
    this.onReconnecting = null;
    this.onReconnected = null;

    /***********************************************************
    * @public methods
    ***********************************************************/

    /*
    * Connects to the gateway with the application key and authentication token.
    */
    this.connect = function (appKey, authToken) {
        /*
        Sanity Checks
        */
        if (isConnected) {
            delegateExceptionCallback(ortc, 'Already connected');
        }
        else if (!url && !clusterUrl) {
            delegateExceptionCallback(ortc, 'URL and Cluster URL are null or empty');
        }
        else if (!appKey) {
            delegateExceptionCallback(ortc, 'Application key is null or empty');
        }
        else if (!authToken) {
            delegateExceptionCallback(ortc, 'Authentication Token is null or empty');
        }
        else if (url && !ortcIsValidUrl(url)) {
            delegateExceptionCallback(ortc, 'Invalid URL');
        }
        else if (clusterUrl && !ortcIsValidUrl(clusterUrl)) {
            delegateExceptionCallback(ortc, 'Invalid Cluster URL');
        }
        else if (!ortcIsValidInput(appKey)) {
            delegateExceptionCallback(ortc, 'Application Key has invalid characters');
        }
        else if (!ortcIsValidInput(authToken)) {
            delegateExceptionCallback(ortc, 'Authentication Token has invalid characters');
        }
        else if (!ortcIsValidInput(announcementSubChannel)) {
            delegateExceptionCallback(ortc, 'Announcement Subchannel has invalid characters');
        }
        else if (connectionMetadata && connectionMetadata.length > connectionMetadataMaxSize) {
            delegateExceptionCallback(ortc, 'Connection metadata size exceeds the limit of ' + connectionMetadataMaxSize + ' characters');
        }
        else{
            ortc.appKey = appKey;
            ortc.authToken = authToken;

            isConnecting = true;
            stopReconnecting = false;

            if (clusterUrl && clusterUrl != null) {
                clusterUrl = ortcTreatUrl(clusterUrl);

                clusterConnection(ortc.getConnectionTimeout());
            }
            else {
                url = ortcTreatUrl(url);

                ortc.sockjs = createSocketConnection(url);
            }

            if (!ortc.reconnectTimeoutlId) {
                // Timeout to reconnect
                ortc.reconnectTimeoutlId = setTimeout(function () {
                    if (!isConnected) {
                        reconnectSocket(ortc.getConnectionTimeout());
                    }
                }, ortc.getConnectionTimeout());
            }
        }
    };

    /*
    * Subscribes to the channel so the client object can receive all messages sent to it by other clients.
    */
    this.subscribe = function (channel, subscribeOnReconnected, onMessageCallback) {
        /*
        Sanity Checks
        */
        if (!isConnected) {
            delegateExceptionCallback(ortc, 'Not connected');
        }
        else if (!channel) {
            delegateExceptionCallback(ortc, 'Channel is null or empty');
        }
        else if (!ortcIsValidInput(channel)) {
            delegateExceptionCallback(ortc, 'Channel has invalid characters');
        }
        else if (subscribedChannels[channel] && subscribedChannels[channel].isSubscribing) {
            delegateExceptionCallback(ortc, 'Already subscribing to the channel \'' + channel + '\'');
        }
        else if (subscribedChannels[channel] && subscribedChannels[channel].isSubscribed) {
            delegateExceptionCallback(ortc, 'Already subscribed to the channel \'' + channel + '\'');
        }
        else if (channel.length > channelMaxSize) {
            delegateExceptionCallback(ortc, 'Channel size exceeds the limit of ' + channelMaxSize + ' characters');
        }
        else if (!ortcIsValidBoolean(subscribeOnReconnected)) {
            delegateExceptionCallback(ortc, 'The argument \'subscribeOnReconnected\' must be a boolean');
        }
        else if (!ortcIsFunction(onMessageCallback)) {
            delegateExceptionCallback(ortc, 'The argument \'onMessageCallback\' must be a function');
        }
        else {
            if (ortc.sockjs != null) {
                var domainChannelCharacterIndex = channel.indexOf(':');
                var channelToValidate = channel;
                var hashPerm = null;

                if (domainChannelCharacterIndex > 0) {
                    channelToValidate = channel.substring(0, domainChannelCharacterIndex + 1) + '*';
                }

                if (userPerms && userPerms != null) {
                    hashPerm = userPerms[channelToValidate] ? userPerms[channelToValidate] : userPerms[channel];
                }

                if (userPerms && userPerms != null && !hashPerm) {
                    delegateExceptionCallback(ortc, 'No permission found to subscribe to the channel \'' + channel + '\'');
                }
                else {
                    if (subscribedChannels[channel]) {
                        subscribedChannels[channel].isSubscribing = true;
                        subscribedChannels[channel].isSubscribed = false;
                        subscribedChannels[channel].subscribeOnReconnected = subscribeOnReconnected;
                        subscribedChannels[channel].onMessageCallback = onMessageCallback;
                    }
                    else {
                        subscribedChannels[channel] = { 'isSubscribing': true, 'isSubscribed': false, 'subscribeOnReconnected': subscribeOnReconnected, 'onMessageCallback': onMessageCallback };
                    }
                    if(ortc.sockjs && ortc.sockjs.isConnected){
                        ortc.sockjs.send(JSON.stringify('subscribe;' + ortc.appKey + ';' + ortc.authToken + ';' + channel + ';' + hashPerm));
                    }
                }
            }
        }
    };

    /*
    * Unsubscribes from the channel so the client object stops receiving messages sent to it.
    */
    this.unsubscribe = function (channel) {
        /*
        Sanity Checks
        */
        if (!isConnected) {
            delegateExceptionCallback(ortc, 'Not connected');
        }
        else if (!channel) {
            delegateExceptionCallback(ortc, 'Channel is null or empty');
        }
        else if (!ortcIsValidInput(channel)) {
            delegateExceptionCallback(ortc, 'Channel has invalid characters');
        }
        else if (!subscribedChannels[channel] || (subscribedChannels[channel] && !subscribedChannels[channel].isSubscribed)) {
            delegateExceptionCallback(ortc, 'Not subscribed to the channel ' + channel);
        }
        else if (channel.length > channelMaxSize) {
            delegateExceptionCallback(ortc, 'Channel size exceeds the limit of ' + channelMaxSize + ' characters');
        }
        else {
            if (ortc.sockjs && ortc.sockjs.isConnected) {
                ortc.sockjs.send(JSON.stringify('unsubscribe;' + ortc.appKey + ';' + channel));
            }
        }
    };

    /*
    * Sends the message to the channel.
    */
    this.send = function (channel, message) {
        /*
        Sanity Checks
        */
        if (!isConnected || ortc.sockjs == null) {
            delegateExceptionCallback(ortc, 'Not connected');
        }
        else if (!channel) {
            delegateExceptionCallback(ortc, 'Channel is null or empty');
        }
        else if (!ortcIsValidInput(channel)) {
            delegateExceptionCallback(ortc, 'Channel has invalid characters');
        }
        else if (!message) {
            delegateExceptionCallback(ortc, 'Message is null or empty');
        }
        else if (!ortcIsString(message)) {
            delegateExceptionCallback(ortc, 'Message must be a string');
        }
        else if (channel.length > channelMaxSize) {
            delegateExceptionCallback(ortc, 'Channel size exceeds the limit of ' + channelMaxSize + ' characters');
        }
        else {
            var domainChannelCharacterIndex = channel.indexOf(':');
            var channelToValidate = channel;
            var hashPerm = null;

            if (domainChannelCharacterIndex > 0) {
                channelToValidate = channel.substring(0, domainChannelCharacterIndex + 1) + '*';
            }

            if (userPerms && userPerms != null) {
                hashPerm = userPerms[channelToValidate] ? userPerms[channelToValidate] : userPerms[channel];
            }

            if (userPerms && userPerms != null && !hashPerm) {
                delegateExceptionCallback(ortc, 'No permission found to send to the channel \'' + channel + '\'');
            }
            else {
                // Multi part
                var messageParts = [];
                var messageId = generateId(8);
                var i;
                var allowedMaxSize = messageMaxSize - channel.length;

                for (i = 0; i < message.length; i = i + allowedMaxSize) {
                    // Just one part
                    if (message.length <= allowedMaxSize) {
                        messageParts.push(message);
                        break;
                    }

                    if (message.substring(i, i + allowedMaxSize)) {
                        messageParts.push(message.substring(i, i + allowedMaxSize));
                    }
                }

                if (messageParts.length == 1) {
                    if(ortc.sockjs && ortc.sockjs.isConnected){
                        ortc.sockjs.send(JSON.stringify('send;' + ortc.appKey + ';' + ortc.authToken + ';' + channel + ';' + hashPerm + ';' + messageId + '_1-1_' + messageParts[0]));
                    }  
                }
                else {
                    for (var j = 1; j <= messageParts.length; j++) {
                        var messageToSend = 'send;' + ortc.appKey + ';' + ortc.authToken + ';' + channel + ';' + hashPerm + ';' + messageId + '_' + j + '-' + messageParts.length + '_' + messageParts[j - 1];
                        this.sendMultiPartMessage(messageToSend);                        
                    }
                }
            }
        }
    };

    /*
    * Sends the message to the channel.
    */
    this.sendProxy = function (applicationKey, privateKey, channel, message) {
        /*
        Sanity Checks
        */
        if (!isConnected || ortc.sockjs == null) {
            delegateExceptionCallback(ortc, 'Not connected');
        }
        else if (!applicationKey) {
            delegateExceptionCallback(ortc, 'Application key is null or empty');
        }
        else if (!privateKey) {
            delegateExceptionCallback(ortc, 'Private key is null or empty');
        }
        else if (!channel) {
            delegateExceptionCallback(ortc, 'Channel is null or empty');
        }
        else if (!ortcIsValidInput(channel)) {
            delegateExceptionCallback(ortc, 'Channel ' + channel + ' has invalid characters');
        }
        else if (!message) {
            delegateExceptionCallback(ortc, 'Message is null or empty');
        }
        else if (!ortcIsString(message)) {
            delegateExceptionCallback(ortc, 'Message must be a string');
        }
        else if (channel.length > channelMaxSize) {
            delegateExceptionCallback(ortc, 'Channel size exceeds the limit of ' + channelMaxSize + ' characters');
        }
        else {

            // Multi part
            var messageParts = [];
            var messageId = generateId(8);
            var i;
            var allowedMaxSize = messageMaxSize - channel.length;

            for (i = 0; i < message.length; i = i + allowedMaxSize) {
                // Just one part
                if (message.length <= allowedMaxSize) {
                    messageParts.push(message);
                    break;
                }

                if (message.substring(i, i + allowedMaxSize)) {
                    messageParts.push(message.substring(i, i + allowedMaxSize));
                }
            }

            if (messageParts.length == 1) {
                if(ortc.sockjs && ortc.sockjs.isConnected){
                    ortc.sockjs.send(JSON.stringify('sendproxy;' + applicationKey + ';' + privateKey + ';' + channel + ';' + messageId + '_1-1_' + messageParts[0]));
                }  
            }
            else {
                for (var j = 1; j <= messageParts.length; j++) {
                    var messageToSend = 'sendproxy;' + applicationKey + ';' + privateKey + ';' + channel + ';' + messageId + '_' + j + '-' + messageParts.length + '_' + messageParts[j - 1];
                    this.sendMultiPartMessage(messageToSend);                        
                }
            }
        }
    };


    this.sendMultiPartMessage = function(message){
        process.nextTick(function(){
            if(ortc.sockjs && ortc.sockjs.isConnected){
                ortc.sockjs.send(JSON.stringify(message));
            }
        });
    }

    /*
    * Disconnects from the gateway.
    */
    this.disconnect = function () {
        clearReconnectInterval();

        // Stop the reconnecting process
        stopReconnecting = true;
        alreadyConnectedFirstTime = false;

        // Clear subscribed channels
        subscribedChannels = Object.create(null);

        /*
        Sanity Checks
        */
        if (!isConnected && !invalidConnection) {
            delegateExceptionCallback(ortc, 'Not connected');
        }
        else {
            disconnectSocket();
        }
    };

    /*
    * Gets a value indicating whether this client object is subscribed to the channel.
    */
    this.isSubscribed = function (channel) {
        /*
        Sanity Checks
        */
        if (!isConnected) {
            delegateExceptionCallback(ortc, 'Not connected');
        }
        else if (!channel) {
            delegateExceptionCallback(ortc, 'Channel is null or empty');
        }
        else if (!ortcIsValidInput(channel)) {
            delegateExceptionCallback(ortc, 'Channel has invalid characters');
        }
        else {
            if (subscribedChannels[channel] && subscribedChannels[channel].isSubscribed) {
                return subscribedChannels[channel].isSubscribed;
            }
            else {
                return false;
            }
        }
    };   
	
    /**
    * @function {public} saveAuthentication Saves the channels and its permissions for the supplied application key and authentication token.
    * @param {string} url The ORTC server URL.
    * @param {bool} isCluster Indicates whether the ORTC server is in a cluster.
    * @param {string} authenticationToken The authentication token generated by an application server (for instance: a unique session ID).
    * @param {bool} authenticationTokenIsPrivate Indicates whether the authentication token is private.
    * @param {string} applicationKey The application key provided when the ORTC service is purchased.
    * @param {int} timeToLive The authentication token time to live (TTL), in other words, the allowed activity time (in seconds).
    * @param {string} privateKey The private key provided when the ORTC service is purchased.
    * @param {object} permissions The channels and their permissions (w: write/read or r: read or p: presence, case sensitive).
    * @param {function(error, success)} callback Function called when the authentication finishes. If 'error' is not null then an error occurred.
    * @returns void

    * @returns void
    *
    * </br>
    * <b class="codeSample">Code Sample:</b>
    *
    * <pre class="brush: js; gutter: false;">
    *   ortcClient.saveAuthentication('http://developers2.realtime.livehtml.net/server/2.1/', true, 'myAuthenticationToken', 0, 'myApplicationKey', 1400, 'myPrivateKey', { "channel1": "wrp", "channel2": "w" }, function (error, success) {
    *       if (error) {
    *           console.log('Error saving authentication: ' + error);
    *       } else if (success) {
    *           console.log('Successfully authenticated');
    *       } else {
    *           console.log('Not authenticated');
    *       }
    *   });
    * </pre>
    */
    this.saveAuthentication = function (url, isCluster, authenticationToken, authenticationTokenIsPrivate, applicationKey, timeToLive, privateKey, permissions, callback) {
        var connectionUrl = url;

        if (isCluster) {
            getServerFromCluster({
                clusterUri : connectionUrl, 
                connectionTimeout : ortc.getConnectionTimeout(),
                appKey : applicationKey
            }, 
            function (error, body) {
                if (error != null) {
                    delegateExceptionCallback(ortc, 'Error getting server from Cluster');
                    callback('Error getting server from Cluster',null);
                }
                else {
                    connectionUrl = body.substring(body.indexOf('=') + 3, body.length - 2);
                    IbtRealtimeRestServices.saveAuthentication(connectionUrl, authenticationToken, authenticationTokenIsPrivate, applicationKey, timeToLive, privateKey, permissions, callback);
                }
            });
        } else {
            IbtRealtimeRestServices.saveAuthentication(connectionUrl, authenticationToken, authenticationTokenIsPrivate, applicationKey, timeToLive, privateKey, permissions, callback);
        }
    };

    /**
     * @function {public} presence Gets a json indicating the subscriptions in the specified channel and if active the first 100 unique metadata.
     * @param {object} Object literal with presence attributes.
     * @... {String} url Server containing the presence service (optional if connected).
     * @... {bool} isCluster Specifies if url is cluster (optional if connected).
     * @... {String} applicationKey Application key with access to presence service (optional if connected).
     * @... {String} authenticationToken Authentication token with access to presence service (optional if connected).
     * @... {String} channel Channel with presence data active.
     * @param {function} Callback with error and result parameters.
     * @returns void
     * 
     * </br>
     * <b class="codeSample">Code Sample:</b>
     *
     * <pre class="brush: js; gutter: false;">
     *      ortcClient.presence({
     *          applicationKey : 'ORTC_APPLICATION_KEY',
     *          authenticationToken : 'AUTHENTICATION_TOKEN',
     *          isCluster : true,
     *          url : 'http://ortc-developers.realtime.co/server/2.1/',
     *          channel : 'CHANNEL_WITH_ACTIVE_PRESENCE'
     *      },
     *      function(error,result){
     *          if(error){
     *              console.log('Presence error:',error);
     *          }else{
     *              if(result){
     *                  console.log('Subscriptions',result.subscriptions);  
     *
     *                  for(var metadata in result.metadata){
     *                      console.log(metadata,'-',result.metadata[metadata]);                                    
     *                  }
     *              }else{
     *                  console.log('Subscriptions empty'); 
     *              }                           
     *          }
     *      }); 
     * </pre>
     */
    this.presence = function (parameters,callback) {
        try{
            var requestUrl = null
            , isCluster = false
            , appKey = ortc.appKey
            , authToken = ortc.authToken;

            if(parameters.url){
                requestUrl = parameters.url;
                isCluster = parameters.isCluster;
                appKey = parameters.applicationKey;
                authToken = parameters.authenticationToken;
            }else{
                if (clusterUrl && clusterUrl != null) {
                    requestUrl = clusterUrl;
                    isCluster = true;
                }
                else {
                    requestUrl = url;
                }    
            }

            getServerUrl({
                requestUrl : requestUrl,
                isCluster : isCluster,
                appKey : appKey
            },
            function(error,serverUrl){
                if(error){
                    callback(error,null);
                }else{
                    IbtRealtimeRestServices.getPresence({
                        url : serverUrl,
                        appKey : appKey, 
                        authToken : authToken,
                        channel : parameters.channel
                    },callback);
                }
            });
        }catch(e){
            callback('Unable to get presence data ' + e,null);
        }
    };

    /**
     * @function {public} enablePresence Enables presence for the specified channel with first 100 unique metadata if true.
     * @param {object} Object literal with presence attributes.
     * @... {String} url Server containing the presence service (optional if connected).
     * @... {bool} isCluster Specifies if url is cluster (optional if connected).
     * @... {String} applicationKey Application key with access to presence service (optional if connected).
     * @... {String} privateKey The private key provided when the ORTC service is purchased.
     * @... {String} channel Channel to activate presence.
     * @... {bool} metadata Defines if to collect first 100 unique metadata.
     * @param {function} Callback with error and result parameters.
     * @returns void
     * 
     * </br>
     * <b class="codeSample">Code Sample:</b>
     *
     * <pre class="brush: js; gutter: false;">
     *      ortcClient.enablePresence({
     *          applicationKey : 'ORTC_APPLICATION_KEY',
     *          channel : 'CHANNEL_TO_ACTIVATE_PRESENCE', 
     *          privateKey : 'ORTC_PRIVATE_KEY', 
     *          url : 'http://ortc-developers.realtime.co/server/2.1/',
     *          isCluster : true,
                metadata : true
     *      },
     *      function(error,result){
     *          if(error){
     *              console.log('Presence',error);  
     *          }else{
     *              console.log('Presence enable',result);              
     *      }); 
     * </pre>
     */
    this.enablePresence = function (parameters,callback) {
        try{
            var requestUrl = null
            , isCluster = false
            , appKey = ortc.appKey;

            if(parameters.url){
                requestUrl = parameters.url;
                isCluster = parameters.isCluster;
                appKey = parameters.applicationKey;
            }else{
                if (clusterUrl && clusterUrl != null) {
                    requestUrl = clusterUrl;
                    isCluster = true;
                }
                else {
                    requestUrl = url;
                }    
            }

            getServerUrl({
                requestUrl : requestUrl,
                isCluster : isCluster,
                appKey : appKey
            },
            function(error,serverUrl){
                if(error){
                    callback(error,null);
                }else{
                    IbtRealtimeRestServices.enablePresence({
                        url : serverUrl,
                        appKey : appKey, 
                        privateKey : parameters.privateKey,
                        channel : parameters.channel,
                        metadata : parameters.metadata == true ? 1 : 0
                    },callback);
                }
            });
        }catch(e){
            callback('Unable to enable presence ' + e,null);
        }
    };

    /**
     * @function {public} disablePresence Disables presence for the specified channel.
     * @param {object} Object literal with presence attributes.
     * @... {String} url Server containing the presence service (optional if connected).
     * @... {bool} isCluster Specifies if url is cluster (optional if connected).
     * @... {String} applicationKey Application key with access to presence service (optional if connected).
     * @... {String} privateKey The private key provided when the ORTC service is purchased.
     * @... {String} channel Channel to disable presence.
     * @param {function} Callback with error and result parameters.
     * @returns void
     * 
     * </br>
     * <b class="codeSample">Code Sample:</b>
     *
     * <pre class="brush: js; gutter: false;">
     *      ortcClient.disablePresence({
     *          applicationKey : 'ORTC_APPLICATION_KEY',
     *          channel : 'CHANNEL_TO_ACTIVATE_PRESENCE', 
     *          privateKey : 'ORTC_PRIVATE_KEY', 
     *          url : 'http://ortc-developers.realtime.co/server/2.1/',
     *          isCluster : true
     *      },
     *      function(error,result){
     *          if(error){
     *              console.log('Presence',error);  
     *          }else{
     *              console.log('Presence enable',result);              
     *      }); 
     * </pre>
     */
    this.disablePresence = function (parameters,callback) {
        try{
            var requestUrl = null
            , isCluster = false
            , appKey = ortc.appKey;

            if(parameters.url){
                requestUrl = parameters.url;
                isCluster = parameters.isCluster;
                appKey = parameters.applicationKey;
            }else{
                if (clusterUrl && clusterUrl != null) {
                    requestUrl = clusterUrl;
                    isCluster = true;
                }
                else {
                    requestUrl = url;
                }    
            }

            getServerUrl({
                requestUrl : requestUrl,
                isCluster : isCluster,
                appKey : appKey
            },
            function(error,serverUrl){
                if(error){
                    callback(error,null);
                }else{
                    IbtRealtimeRestServices.disablePresence({
                        url : serverUrl,
                        appKey : appKey, 
                        privateKey : parameters.privateKey,
                        channel : parameters.channel
                    },callback);
                }
            });
        }catch(e){
            callback('Unable to disable presence ' + e,null);
        }
    };

    /***********************************************************
    * @private methods
    ***********************************************************/

    var getServerUrl = function(parameters,callback){
         if (parameters.requestUrl && parameters.isCluster) {
            var clusterUrl = ortcTreatUrl(parameters.requestUrl);

            getServerFromCluster({
                clusterUri : clusterUrl, 
                appKey : parameters.appKey
            }, 
            function (error, body) {
                if (error != null) {
                    callback('Error getting server from Cluster',null);
                }
                else {
                    var resultUrl = body.substring(body.indexOf('=') + 3, body.length - 2);
                    callback(null,resultUrl);
                }
            });
        }
        else {
            var resultUrl = ortcTreatUrl(parameters.requestUrl);
            callback(null,resultUrl);
        }
    };

    var clearReconnectInterval = function () {
        // Clear the reconnecting interval
        if (ortc.reconnectIntervalId) {
            clearInterval(ortc.reconnectIntervalId);
            ortc.reconnectIntervalId = null;
        }

        // Clear the reconnecting timeout
        if (ortc.reconnectTimeoutlId) {
            clearTimeout(ortc.reconnectTimeoutlId);
            ortc.reconnectTimeoutlId = null;
        }
    };

    var ortcIsValidUrl = function (input) {
        return (/^\s*(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?\s*$/).exec(input) ? true : false;
    };

    var ortcIsValidInput = function (input) {
        return (/^[\w-:\/\.]*$/).exec(input) ? true : false;
    };

    var ortcIsValidBoolean = function (input) {
        return (/^(true|false|0|1)$/).exec(input) ? true : false;
    };

    var ortcIsFunction = function (input) {
        return typeof (input) == 'function' ? true : false;
    };

    var ortcIsString = function (input) {
        return typeof (input) == 'string' ? true : false;
    };

    var ortcTreatUrl = function (url) {
        url = url.replace(/\s+/g, '');

        if (url.charAt(url.length - 1) == '/') {
            url = url.substring(0, url.length - 1);
        }

        return url;
    };

    /*
    * Generates an ID.
    */
    var generateId = function (size) {
        var result = '';

        var S4 = function () {
            return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
        };

        for (var i = 0; i < size / 4; i++) {
            result += S4();
        }

        return result;
    };

    /*
    * Disconnects the socket.
    */
    var disconnectSocket = function () {
        reconnectStartedAt = null;
        isConnecting = false;
        if (ortc.sockjs && ortc.sockjs != null  && ortc.sockjs.isConnected) {
            ortc.sockjs.close();
            ortc.sockjs = null;
        }
    };

    /*
    * Reconnects the socket.
    */
    var reconnectSocket = function (clusterTimeout) {
        clearReconnectInterval();

        if (isConnecting) {
            delegateExceptionCallback(ortc, 'Unable to connect...');
            disconnectSocket();
        }

        isConnecting = true;

        delegateReconnectingCallback(ortc);

        reconnectStartedAt = new Date().getTime();

        if (clusterUrl && clusterUrl != null) {
            clusterConnection(clusterTimeout);
        }
        else {
            ortc.sockjs = createSocketConnection(url);
        }

        if (!ortc.reconnectTimeoutlId) {
            // Timeout to reconnect
            ortc.reconnectTimeoutlId = setTimeout(function () {
                if (!isConnected) {
                    reconnectSocket(ortc.getConnectionTimeout());
                }
            }, ortc.getConnectionTimeout());
        }
    };

    /*
    * Tries a connection through the cluster gateway with the application key and authentication token.
    */
    var clusterConnection = function (clusterTimeout) {
        if (clusterUrl != null) {
            getServerFromCluster({
                clusterUri : clusterUrl, 
                clusterTimeout : clusterTimeout,
                appKey : ortc.appKey
            }, 
            function (error, body) {
                if (error != null) {
                    delegateExceptionCallback(ortc, 'Error getting server from Cluster');
                }
                else {
                    if (body.indexOf('SOCKET_SERVER') >= 0) {
                        url = body.substring(body.indexOf('=') + 3, body.length - 2);
                        sockjs = createSocketConnection(ortc.getUrl());
                    }
                }
            });
        }
    };

    /*
    * Gets server from the cluster.
    */
    var getServerFromCluster = function (parameters,callback) {
        var queryString = parameters.appKey ? 'appkey=' + parameters.appKey : "";

        var parsedUrl = urlParser.parse(parameters.clusterUri + '?' + queryString);
        
        httpRequest.get({
            url : parsedUrl.hostname,        
            path : parsedUrl.pathname,
            parameters : parsedUrl.query,
            callback : function(error,responseData){
                if (error != null) {
                    callback(error, null);
                }
                else {
                    callback(null, responseData.content);
                }
            }
        });
    };

    /*
    * Creates a socket connection.
    */
    var createSocketConnection = function (connectionUrl) {
        if (ortc.sockjs == null) {
            var wsScheme = 'ws';
            var wsUrl = connectionUrl;

            if (connectionUrl.substring(0, 7) == 'http://') {
                wsUrl = wsUrl.substring(7);
            }
            else if (connectionUrl.substring(0, 8) == 'https://') {
                wsUrl = wsUrl.substring(8);
                wsScheme = 'wss';
            }

            var connid = strings.random_string(8);
            var serverId = strings.random_number_string(1000);

            var socket = new IbtRealTimeWebSocket(wsScheme + '://' + wsUrl + '/broadcast/' + serverId + '/' + connid + '/websocket');
            ortc.sockjs = socket.connection();
            // Connect handler
            ortc.sockjs.onopen = function () {
                // Update last keep alive time
                lastKeepAlive = new Date().getTime();
                if(ortc.sockjs && ortc.sockjs.isConnected){
                    ortc.sockjs.send(JSON.stringify('validate;' + ortc.appKey + ';' + ortc.authToken + ';' + (announcementSubChannel ? announcementSubChannel : '') + ';' + '' + ';' + (connectionMetadata ? connectionMetadata : '')));
                }

            };

            // Disconnect handler
            ortc.sockjs.onclose = function (e) {
                ortc.sockjs = null;

                if (isConnected) {
                    isConnected = false;
                    isConnecting = false;
                    delegateDisconnectedCallback(ortc);
                }

                if (!stopReconnecting && (!reconnectStartedAt || (reconnectStartedAt + connectionTimeout < new Date().getTime()))) {
                    reconnectSocket(ortc.getConnectionTimeout());
                }
            };

            // Error handler (when connecting to an non existent server)
            ortc.sockjs.onerror = function () {
            };

            // Receive handler
            ortc.sockjs.onmessage = function (m) {
                // Update last keep alive time
                lastKeepAlive = new Date().getTime();

                var messageType = m.data[0];

                switch (messageType) {
                    case 'o': // open
                        break;
                    case 'a': // message
                        var data = JSON.parse(JSON.parse(m.data.substring(1))[0]);
                        var op = data.op;

                        switch (op) {
                            case 'ortc-validated':
                                if (data.up) {
                                    userPerms = data.up; // user permissions
                                }

                                isConnecting = false;
                                isConnected = true;
                                reconnectStartedAt = null;

                                if (alreadyConnectedFirstTime) {
                                    var channelsToRemove = Object.create(null);

                                    // Subscribe to the previously subscribed channels
                                    for (var key in subscribedChannels) {
                                        // Subscribe again
                                        if (subscribedChannels[key].subscribeOnReconnected == true && (subscribedChannels[key].isSubscribing || subscribedChannels[key].isSubscribed)) {
                                            subscribedChannels[key].isSubscribing = true;
                                            subscribedChannels[key].isSubscribed = false;

                                            var domainChannelCharacterIndex = key.indexOf(':');
                                            var channelToValidate = key;
                                            var hashPerm = null;

                                            if (domainChannelCharacterIndex > 0) {
                                                channelToValidate = key.substring(0, domainChannelCharacterIndex + 1) + '*';
                                            }

                                            if (userPerms && userPerms != null) {
                                                hashPerm = userPerms[channelToValidate] ? userPerms[channelToValidate] : userPerms[key];
                                            }
                                            if(ortc.sockjs && ortc.sockjs.isConnected){
                                                ortc.sockjs.send(JSON.stringify('subscribe;' + ortc.appKey + ';' + ortc.authToken + ';' + key + ';' + hashPerm));
                                            }
                                        }
                                        else {
                                            channelsToRemove[key] = key;
                                        }
                                    }

                                    for (var chnKey in channelsToRemove) {                                        
                                        ObjectLiterals.removeEntry(subscribedChannels,chnKey);
                                    }

                                    // Clean messages buffer (can have lost message parts in memory)
                                    messagesBuffer = Object.create(null);

                                    delegateReconnectedCallback(ortc);
                                }
                                else {
                                    alreadyConnectedFirstTime = true;

                                    delegateConnectedCallback(ortc);
                                }

                                if (!ortc.reconnectIntervalId) {
                                    // Interval to reconnect
                                    ortc.reconnectIntervalId = setInterval(function () {
                                        if (lastKeepAlive != null && (lastKeepAlive + 35000 < new Date().getTime())) { // 35 seconds
                                            lastKeepAlive = null;

                                            // Server went down
                                            if (isConnected) {
                                                disconnectSocket();

                                                if (isConnected) {
                                                    isConnected = false;
                                                    isConnecting = false;

                                                    delegateDisconnectedCallback(ortc);

                                                    reconnectSocket(ortc.getConnectionTimeout());
                                                }
                                            }
                                        }
                                    }, ortc.getConnectionTimeout());
                                }

                                break;
                            case 'ortc-subscribed':
                                var channelSubscribed = data.ch;

                                if (subscribedChannels[channelSubscribed]) {
                                    subscribedChannels[channelSubscribed].isSubscribing = false;
                                    subscribedChannels[channelSubscribed].isSubscribed = true;
                                }

                                delegateSubscribedCallback(ortc, channelSubscribed)
                                break;
                            case 'ortc-unsubscribed':
                                var channelUnsubscribed = data.ch;

                                if (subscribedChannels[channelUnsubscribed]) {
                                    subscribedChannels[channelUnsubscribed].isSubscribing = false;
                                    subscribedChannels[channelUnsubscribed].isSubscribed = false;
                                }

                                delegateUnsubscribedCallback(ortc, channelUnsubscribed)
                                break;
                            case 'ortc-error':
                                var data = data.ex ? data.ex : data;
                                var operation = data.op;
                                var error = data.ex;

                                delegateExceptionCallback(ortc, error);
                                switch (operation) {
                                    case 'validate':
                                        if(error.indexOf("Unable to connect") > -1 || error.indexOf("Server is too busy") > -1){
                                            disconnectSocket();                                            
                                        }else{
                                            invalidConnection = true;

                                            // Stop the reconnecting process
                                            stopReconnecting = true;
                                            alreadyConnectedFirstTime = false;
                                            subscribedChannels = Object.create(null);
                                            clearReconnectInterval();
                                            
                                        }                                        
                                        break;
                                    case 'subscribe':
                                        if (channel && subscribedChannels[channel]) {
                                            subscribedChannels[channel].isSubscribing = false;
                                        }
                                        break;
                                    case 'subscribe_maxsize':
                                    case 'unsubscribe_maxsize':
                                    case 'send_maxsize':
                                        if (channel && subscribedChannels[channel]) {
                                            subscribedChannels[channel].isSubscribing = false;
                                        }

                                        // Stop the reconnecting process
                                        stopReconnecting = true;
                                        alreadyConnectedFirstTime = false;

                                        clearReconnectInterval();
                                        break;
                                    default:
                                        break;
                                }

                                if (stopReconnecting) {
                                    delegateDisconnectedCallback(ortc);
                                }
                                break;
                            default:
                                var channel = data.ch;
                                var message = data.m;

                                // Multi part
                                var regexPattern = /^(\w[^_]*)_{1}(\d*)-{1}(\d*)_{1}([\s\S.]*)$/;
                                var match = regexPattern.exec(message);

                                var messageId = null;
                                var messageCurrentPart = 1;
                                var messageTotalPart = 1;
                                var lastPart = false;

                                if (match && match.length > 0) {
                                    if (match[1]) {
                                        messageId = match[1];
                                    }
                                    if (match[2]) {
                                        messageCurrentPart = match[2];
                                    }
                                    if (match[3]) {
                                        messageTotalPart = match[3];
                                    }
                                    if (match[4]) {
                                        message = match[4];
                                    }
                                }

                                // Is a message part
                                if (messageId) {
                                    if (!messagesBuffer[messageId]) {
                                        messagesBuffer[messageId] = Object.create(null);
                                    }

                                    messagesBuffer[messageId][messageCurrentPart] = message;

                                    // Last message part
                                    if (Object.keys(messagesBuffer[messageId]).length == messageTotalPart) {
                                        lastPart = true;
                                    }
                                }
                                // Message does not have multipart, like the messages received at announcement channels
                                else {
                                    lastPart = true;
                                }

                                if (lastPart) {
                                    if (messageId) {
                                        message = '';

                                        for (var i = 1; i <= messageTotalPart; i++) {
                                            message += messagesBuffer[messageId][i];

                                            // Delete from messages buffer                                            
                                            ObjectLiterals.removeEntry(messagesBuffer[messageId],i)
                                        }

                                        // Delete from messages buffer
                                        ObjectLiterals.removeEntry(messagesBuffer,messageId);
                                    }

                                    delegateMessagesCallback(ortc, channel, message);
                                }
                                break;
                        }

                        break;
                    case 'h': // heartbeat
                        break;
                    default:
                        break;
                }
            };
        }

        return ortc.sockjs;
    };

    /*
    * Calls the onConnected callback if defined.
    */
    var delegateConnectedCallback = function (ortc) {
        if (ortc != null && ortc.onConnected != null) {
            ortc.onConnected(ortc);
        }
    };

    /*
    * Calls the onDisconnected callback if defined.
    */
    var delegateDisconnectedCallback = function (ortc) {
        if (ortc != null && ortc.onDisconnected != null) {
            ortc.onDisconnected(ortc);
        }
    };

    /*
    * Calls the onSubscribed callback if defined.
    */
    var delegateSubscribedCallback = function (ortc, channel) {
        if (ortc != null && ortc.onSubscribed != null && channel != null) {
            ortc.onSubscribed(ortc, channel);
        }
    };

    /*
    * Calls the onUnsubscribed callback if defined.
    */
    var delegateUnsubscribedCallback = function (ortc, channel) {
        if (ortc != null && ortc.onUnsubscribed != null && channel != null) {
            ortc.onUnsubscribed(ortc, channel);
        }
    };

    /*
    * Calls the onMessages callbacks if defined.
    */
    var delegateMessagesCallback = function (ortc, channel, message) {
        if (ortc != null && subscribedChannels[channel] && subscribedChannels[channel].isSubscribed && subscribedChannels[channel].onMessageCallback != null) {
            subscribedChannels[channel].onMessageCallback(ortc, channel, message);
        }
    };

    /*
    * Calls the onException callback if defined.
    */
    var delegateExceptionCallback = function (ortc, event) {
        if (ortc != null && ortc.onException != null) {
            ortc.onException(ortc, event);
        }
    };

    /*
    * Calls the onReconnecting callback if defined.
    */
    var delegateReconnectingCallback = function (ortc) {
        if (ortc != null && ortc.onReconnecting != null) {
            ortc.onReconnecting(ortc);
        }
    };

    /*
    * Calls the onReconnected callback if defined.
    */
    var delegateReconnectedCallback = function (ortc) {
        if (ortc != null && ortc.onReconnected != null) {
            ortc.onReconnected(ortc);
        }
    };
};