var querystring = require('querystring');

this.post = function (postData) {
    var postContent = !postData.parameters ? "" : (typeof (postData.parameters) == 'string') ? postData.parameters : querystring.stringify(postData.parameters);

    var headers = {
        'host': postData.url,
        'port': postData.port,
        'path': postData.path,
        'method': 'POST',
        'content-length': postContent.length,
        'content-type': 'application/x-www-forum-urlencoded'
    };

    var httpClient = postData.port == 443 ? require('https') : require('http');

    var request = httpClient.request(headers, function (response) {
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

this.get = function (getData) {
    var getParameters = !getData.parameters ? "" : (typeof (getData.parameters) == 'string') ? getData.parameters : querystring.stringify(getData.parameters);
    var requestPath = getParameters ? getData.path + '?' + getParameters : getData.path;

    var headers = {
        'host': getData.url,
        'port': getData.port,
        'path': requestPath,
        "user-agent" : "ortc-server-side-api"
    };

    var httpClient = getData.port == 443 ? require('https') : require('http');

    var request = httpClient.get(headers, function (response) {
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