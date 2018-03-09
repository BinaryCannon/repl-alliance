const Command = require('./command');
const Mode = require('./mode');
const ReplBase = require('./index');
const Type = require('./type');
const {string, boolean} = Type;

const addressBook = {
    "adam": "Adam Iley",
    "bob": "Robert Jones"
};
const person = new Type("person", (str) => ({value: addressBook[str] || str}), () => Object.keys(addressBook));

const x = new ReplBase();
x.mode()
    .add(new Command("print", [Type.String], (x) => console.log(x), 'Outputs a message.', ['show', 'display', 'log']))
    .add(new Command('use', [x.type.mode], function(mode) {this.setMode(mode)}, "Change mode"))
    .add(x.actions.help);

const childMode = new Mode(x.mode());
childMode.add(new Command('boom', [boolean, boolean, string], (a, b, c) => [a, b, c]))
    .add(new Command('add', [string, string], (name, fullname) => addressBook[name] = fullname))
    .add(new Command('who', [person], (name) => name, "Looks up the full name of a person."))
    .add(Command.run);

x.addMode("extra", childMode);
x.setMode("extra");
x.on('mode-changed', (newMode) => {
    x.repl.setPrompt(newMode + " > ");
});

x.start({
    prompt: x.currentMode + " > "
});