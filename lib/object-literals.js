/**
* @fileoverview This file contains some object literals generic functions
* @author ORTC team members (ortc@ibt.pt) 
*/

/**
 * Remove the entry from an object
 * @param {object} obj - The object.
 * @param {string} key - The key to remove.
 */
this.removeEntry = function (obj, key) {
    var value = obj[key];
    value = null;
    return delete obj[key];
};