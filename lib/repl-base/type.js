const fs = require('fs');
const path = require('path');

const {id, isFile, isDirectory} = require('./utils');

class Type {
    constructor(name, parser, completer, renderer = id) {
        if (typeof name !== "string") {throw new Error("Type name must be a string.");}
        if (typeof parser !== 'function') {throw new Error('Type parser must be a function, was ' + typeof parser);}
        if (typeof completer !== 'function') {throw new Error('Type completer must be a function, was ' + typeof completer);}

        this.name = name;
        this.parse = parser;        // returns {value, error}
        this.suggest = completer;   // returns [possibilities]
        this.render = renderer;     // return string
    }

    toString() {
        return `<${this.name}>`
    }
}

Type.rest = new Type('rest', (value) => ({value}), () => []);
Type.string = new Type('string', (value) => ({value}), () => []);
Type.boolean = new Type('boolean', (str) => {
    const input = str.toLowerCase();
    if (input === 'true' || input === 'on' || input === '1') {
        return {value: true}
    } else if (input === 'false' || input === 'off' || input === '0') {
        return {value: false}
    } else {
        return {error: 'Value ' + str + ' is not a boolean.'}
    }
}, () => (['true', 'on', '1', 'false', 'off', '0']));

Type.file = new Type( 'file', (str) => ({value: str, errors: []}), (pathname) => {
    if (isFile(pathname)) {
        return [pathname]
    }
    let parent = pathname;
    if (!isDirectory(pathname)) {
        parent = path.dirname(pathname);
    }
    if (isDirectory(parent)) {
        try {
            const possibleFiles = fs.readdirSync(parent);
            return possibleFiles.map((c) => path.join(parent, c));
        } catch (e) {}
    }
    return [pathname];
});

module.exports = Type;