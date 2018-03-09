const fs = require('fs');

exports.id = function id(x) {return x}

const splitRegex = /\s*(?:(?:"((?:\\"|[^"])*)(?:"|$))|(?:'((?:\\'|[^'])*)(?:'|$))|([^\s]+))/g;
exports.split = function split(str) {
    const result = [];
    str.replace(splitRegex, (part, dquoteMatch, squoteMatch, wsMatch, offset, fullString) => {
        result.push(dquoteMatch !== undefined ? dquoteMatch : squoteMatch !== undefined ? squoteMatch : wsMatch)
    });
    return result;
};

exports.isFile = function isFile(pathname) {
    try {
        return fs.lstatSync(pathname).isFile();
    } catch (err) {
        return false;
    }
};

exports.isDirectory = function isDirectory(pathname) {
    try {
        return fs.lstatSync(pathname).isDirectory();
    } catch (err) {
        return false;
    }
};