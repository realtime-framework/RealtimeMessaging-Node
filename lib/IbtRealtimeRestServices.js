/**
 * @fileoverview This file contains calls to the ortc rest webservices
 */

var querystring = require('querystring'); 
var urlApi = require('url');

this.channelPermissions = {
		Read : 'r',
		Write : 'w',
        Presence : 'p'
};	 
	
 /**
 * Saves authentication for the specified token with the specified authentication key
 * @param {int} Max value
 */
this.saveAuthentication = function (connectionUrl, authenticationToken, authenticationTokenIsPrivate, applicationKey, timeToLive, privateKey, permissions, callback) {
    var url = urlApi.parse(connectionUrl);
    
    var saveAuthenticationData = {
        AT: authenticationToken,
        PVT: authenticationTokenIsPrivate,
        AK: applicationKey,
        TTL: timeToLive,
        PK: privateKey,
        TP: Object.size(permissions)
    }

    for (var permission in permissions) {
        saveAuthenticationData[permission] = permissions[permission];
    }

    var saveAuthenticationRequest = {
       url : url.hostname,
        port : url.port,
        path : '/authenticate',
        parameters : saveAuthenticationData,
        callback : function(error,result){
            if(error){
                callback(error.content,false);
            }else{
                callback(null,true);
            }
        }
    }

    post(saveAuthenticationRequest);
};

this.enablePresence = function(parameters,callback){
    var url = urlApi.parse(parameters.url);

    var enableParameters = { privatekey : parameters.privateKey };
    if(parameters.metadata){
        enableParameters["metadata"] = parameters.metadata;    
    }     

    var enablePresenceRequest = {
       url : url.hostname,
        port : url.port,
        path : '/presence/enable/' + parameters.appKey + '/' + parameters.channel,
        parameters : enableParameters,
        callback : function(error,result){
            if(error){
                callback(error.content,null);
            }else{
                if(result){
                    callback(null,result.content);
                }else{
                    callback(null,null);
                }
            }
        }
    }

    post(enablePresenceRequest);
};

this.disablePresence = function(parameters,callback){
    var url = urlApi.parse(parameters.url);
    
    var disablePresenceRequest = {
       url : url.hostname,
        port : url.port,
        path : '/presence/disable/' + parameters.appKey + '/' + parameters.channel,
        parameters : { privatekey : parameters.privateKey},
        callback : function(error,result){
            if(error){
                callback(error.content,null);
            }else{
                if(result){
                    callback(null,result.content);
                }else{
                    callback(null,null);
                }
            }
        }
    }

    post(disablePresenceRequest);
};

this.getPresence = function(parameters,callback){
    var url = urlApi.parse(parameters.url);

    var enablePresenceRequest = {
        url : url.hostname,
        port : url.port,
        path : '/presence/' + parameters.appKey + '/' + parameters.authToken + '/' + parameters.channel,
        callback : function(error,result){
            if(error){
                callback(error.content,null);
            }else{
                var data = null;
                if(result){
                    try{
                        data = JSON.parse(result.content);
                    }catch(e){}                    
                }
                callback(null,data);
            }
        }
    }

    get(enablePresenceRequest);
};


var post = function (postData) {
    var postContent = !postData.parameters ? "" : (typeof (postData.parameters) == 'string') ? postData.parameters : querystring.stringify(postData.parameters);

    var postOptions = {
        'host': postData.url,
        'port': postData.port,
        'path': postData.path,
        'method': 'POST',
        'headers' : {
            'content-length': postContent.length,
            'content-type': 'application/x-www-form-urlencoded'
        }
    };

    for(var headerIndex in postData.headers){
        postOptions.headers[headerIndex] = postData.headers[headerIndex];
    }

    var httpClient = postData.port == 443 || postData.secure ? require('https') : require('http');

    var request = httpClient.request(postOptions, function (response) {
        var statusCode = response.statusCode;
        var data = '';

        response.addListener('data', function (chunk) {
            data += chunk;
        });

        response.addListener('end', function () {
            if (statusCode >= 400 && statusCode <= 599) {
                postData.callback({
                    code: statusCode,
                    content: new Buffer(data, 'binary').toString()
                }, null);
            } else {
                postData.callback(null, {
                    code: statusCode,
                    content: new Buffer(data, 'binary').toString()
                });
            }
        });
    });

    request.on('error', function (error) {
        postData.callback({
            code: null,
            content: error.toString()
        }, null);
    });

    request.write(postContent);
    request.end();
};

var get = function (getData) {
    var getParameters = !getData.parameters ? "" : (typeof (getData.parameters) == 'string') ? getData.parameters : querystring.stringify(getData.parameters);
    var requestPath = getParameters ? getData.path + '?' + getParameters : getData.path;

    var getOptions = {
        'host': getData.url,
        'port': getData.port,
        'path': requestPath,
        'method' : 'GET'
    };

    for(var headerIndex in getData.headers){
        getOptions.headers = getOptions.headers ? getOptions.headers : {};

        getOptions.headers[headerIndex] = getData.headers[headerIndex];
    }

    var httpClient = getData.port == 443 || getData.secure ? require('https') : require('http');

    var request = httpClient.get(getOptions, function (response) {
        var statusCode = response.statusCode;
        var data = '';

        response.addListener('data', function (chunk) {
            data += chunk;
        });

        response.addListener('end', function () {
            if (statusCode >= 400 && statusCode <= 599) {
                getData.callback({
                    code: statusCode,
                    content: new Buffer(data, 'binary').toString()
                }, null);
            } else {
                getData.callback(null, {
                    code: statusCode,
                    content: new Buffer(data, 'binary').toString()
                });
            }
        });
    });

    request.on('error', function (error) {
        getData.callback({
            code: null,
            content: error.toString()
        }, null);
    });

    request.end();
};

Object.size = function(obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};
















