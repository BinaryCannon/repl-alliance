const fs = require('fs');
const Type = require('./type');

class Command {
    constructor(name, parameterTypes, fn, help = '', aliases = []) {
        this.name = name;
        this.aliases = aliases;
        this.parameterTypes = parameterTypes;
        this.action = fn;
        this.help = help;
    }

    parse(params) {
        const result = [];
        const errors = [];
        const args = [...params];
        let incomplete = false;
        for (let type of this.parameterTypes) {
            if (args.length === 0) {
                incomplete = true;
                break;
            }
            if (type === Type.rest) {
                result.push(args.map((a) => a.indexOf(' ') >= 0 ? '"' + a + '"' : a).join(' '));
                args.length = 0;
            } else {
                const {value, error} = type.parse(args.shift());
                result.push(value);
                if (error != null) {
                    errors.push(error);
                }
            }
        }
        if (args.length > 0) {
            errors.push("Unused arguments: " + args.join(" "));
        }
        return {arguments:result, errors, incomplete}
    }

    usage() {
        return `Syntax: ${this.name} ${this.parameterTypes.join(" ") + (this.help ? "\n\t" + this.help : "")}`
    }
}

Command.prompt = new Command(
    'prompt',
    [Type.string],
    function(newPrompt) { this.repl.setPrompt(newPrompt) },
    'Sets the prompt string that appears at the start of an input line.'
);
Command.exit = new Command(
    'exit',
    [],
    () => process.exit(),
    'Quits.'
);
Command.run = new Command(
    'run',
    [Type.file],
    async function(file) {
        return this.runScript(file);
    },
    'Runs a file of commands.'
);
Command.comment = new Command('#', [Type.rest], () => undefined, 'Ignores the rest of the line.');
Command.print = new Command('print', [Type.rest], (str) => console.log(str), 'Displays the message.');

module.exports = Command;