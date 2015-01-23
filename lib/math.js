/**
 * @fileoverview This file contains some math generic functions
 */

 /**
 * Rounds a decimal number for the specified number of decimal places
 * @param {float} Number to round
 * @param {int} Number of decimal places
 */
this.roundNumber = function (num, dec) {
    var result = Math.round(num * Math.pow(10, dec)) / Math.pow(10, dec);
    return result;
};

 /**
 * Generates a random number in the interval [0,max]
 * @param {int} Max value
 */
this.random_number = function(max) {
    return Math.floor(Math.random() * max);
};