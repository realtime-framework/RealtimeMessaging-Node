/**
 * @fileoverview This file contains some strings generic functions
 */

var util = require('util');
var math = require('./math');

 /**
 * Removes the white spaces after and before the text in a string
 * @param {string} String to trim
 */
this.trim = function (strg) {
    var str = strg.replace(/^\s\s*/, ''),
		ws = /\s/,
		i = str.length;
    while (ws.test(str.charAt(--i)));
    return str.slice(0, i + 1);
};

 /**
 * Generates a GUID
 */
this.generateGuid = function () {
        var S4 = function () {
            return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
        };
        return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
};

var random_string_chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
 /**
 * Generates a random alpha numeric string with the specified length
 * @param {int} String length
 */
this.random_string = function(length, max) {
    max = max || random_string_chars.length;
    var i, ret = [];
    for(i=0; i < length; i++) {
        ret.push( random_string_chars.substr(Math.floor(Math.random() * max),1) );
    }
    return ret.join('');
};

 /**
 * Generates a random numeric string with the specified max number
 * @param {int} String max number
 */
this.random_number_string = function(max) {
    var t = (''+(max - 1)).length;
    var p = Array(t+1).join('0');
    return (p + math.random_number(max)).slice(-t);
};