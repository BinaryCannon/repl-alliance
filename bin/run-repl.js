#! /usr/bin/env node

const argv = require('minimist')(process.argv.slice(2))
const Repl = require('../lib/repl-alliance');

const dir = argv.dir || argv.d || argv._[0] || '.';
const environment = argv.environment || argv.env || argv.e || 'development';
const script = argv.script || argv.s;

const repl = new Repl(dir, environment);
repl.start({}, script);