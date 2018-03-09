#! /usr/bin/env node

const path = require('path');
const argv = require('minimist')(process.argv.slice(2));
const Repl = require('../lib/repl-alliance');
const fs = require('fs');

if (argv.help || argv.h) {
    console.log("repl-alliance [<truffle dir>] [--dir <truffle dir>] [--environment <env>] [--script <script file>]");
    console.log("\nStarts a repl for examining ethereum contracts by loading the information it needs from a truffle directory");
    process.exit(0);
}

const dir = argv.dir || argv.d || argv._[0] || '.';
const environment = argv.environment || argv.env || argv.e || 'development';
const script = argv.script || argv.s;

const resolvedDir = path.resolve(dir);
const contractsDir = path.join(resolvedDir, 'build', 'contracts');
const allContracts = fs.readdirSync(contractsDir)
    .map((filename) => JSON.parse(fs.readFileSync(path.join(contractsDir, filename), 'utf8')));
const networks = require(path.join(resolvedDir, 'truffle-config.js')).networks;

// networks looks like {environment: {host, port}}
// allContracts looks like [{contractName, abi, networks: {[netId]: address}}]
const repl = new Repl(networks, environment);
repl.start(allContracts, script, {});