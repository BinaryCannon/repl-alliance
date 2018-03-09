const fs = require('fs');
const path = require('path');

const {id, isFile, isDirectory} = require('./utils');

class Type {
    constructor(name, parser, completer, renderer = id) {
        this.name = name;
        this.parse = parser; // returns {value, error}
        this.suggest = completer; // returns [possibilities]
        this.render = renderer;
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
            const possibleFiles = fs.readdirSync(parent)
            return possibleFiles.map((c) => path.join(parent, c));
        } catch (e) {}
    }
    return [pathname];
});

module.exports = Type;