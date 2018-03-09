const fs = require('fs');
const Repl = require('repl');
const EventEmitter = require('events');

const {split} = require('./utils');
const Command = require('./command');
const Mode = require('./mode');
const Type = require('./type');

class ReplBase extends EventEmitter {
    constructor() {
        super();
        this.modes = {};
        this.currentMode = 'default';
        this.repl = null;
        this.print = true;

        this.type = {
            mode: new Type('mode',
                (str) => (this.modes[str] ? {value: str} : {error: str + " was not a mode, available modes are " + Object.keys(this.modes).join(", ")}),
                () => Object.keys(this.modes)),
            command: new Type(
                'command',
                (str) => (this.mode().availableActionNames().indexOf(str) >= 0 ? {value: str} : {error: str + " was not a known action, available actions are " + this.mode().availableActionNames().join(", ")}),
                () => this.mode().availableActionNames())
        };

        this.actions = {
            help: new Command('help', [this.type.command],
                function (action) {
                    console.log(this.mode().help(action));
                },
                'Finds out the help information for an action.'),
            use: new Command('use', [this.type.mode], function (mode) {
                this.setMode(mode);
            }, "Change mode.")
        };
    }

    setMode(modeName) {
        const oldMode = this.currentMode;
        this.currentMode = modeName;
        if (oldMode !== modeName) {
            this.emit('mode-changed', modeName, oldMode)
        }
    }

    addMode(modeName, mode = new Mode()) {
        this.modes[modeName] = mode;
        return mode;
    }

    mode(modeName = this.currentMode) {
        if (this.modes[modeName] === undefined) {
            this.addMode(modeName);
        }
        return this.modes[modeName];
    }

    start(options) {
        this.repl = Repl.start({
            prompt: '> ',
            ignoreUndefined: true,
            ...(options || {}),
            eval: (line, env, ns, finish) => this.exec(line).then((result) => finish(null, result)).catch((err) => finish(err)),
            completer: (linePartial) => this.suggest(linePartial)
        });
        return this.repl;
    }

    async exec(line) {
        const parts = split(line);
        if (parts.length === 0) {
            return;
        }
        const actionName = parts.shift();

        return this.mode().exec(this, actionName, parts);
    }

    suggest(linePartial) {
        const lineParts = split(linePartial);
        const {possibleTerms, last} = this.mode().suggest(lineParts);

        let hits = possibleTerms
            .filter((c) => c.toLowerCase().startsWith(last.toLowerCase()));

        if (hits.length === 1 && hits[0].indexOf(' ') >= 0) {
            this.repl.line = this.repl.line.substring(0, this.repl.line.length - last.length);
            if (this.repl.line.endsWith('"')) {
                this.repl.line = this.repl.line.substring(0, this.repl.line.length - 1);
            }
            return [['"' + hits[0] + '"'], ""]
        }
        return [hits.length ? hits : possibleTerms, last];
    }

    async runScript(file) {
        const contents = fs.readFileSync(file, 'utf8').split('\n');
        const starting = {};
        let lastResult = starting;

        for (let line of contents) {
            if (lastResult !== starting) {
                if (lastResult !== undefined || !this.repl.ignoreUndefined) {
                    console.log(this.repl.writer(lastResult));
                }
            }
            if (this.print) {
                this.repl.prompt();
                console.log(line);
            }
            lastResult = await this.exec(line);
        }
        return lastResult
    }
}

module.exports = ReplBase;