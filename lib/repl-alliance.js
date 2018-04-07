const Eth = require('ethjs');
const eabi = require('ethjs-abi');
const ReplBase = require('./repl-base');
const Command = require('./repl-base/command');
const Mode = require('./repl-base/mode');
const Type = require('./repl-base/type');

const uint256regex = /^(?:0x[0-9a-fA-F]{1,64})|(?:1?[0-9]{1,77}[kMGTPEZY]?)/;

function reverseLookup(value, obj) {
    for (let key of Object.keys(obj)) {
        if (obj[key].toLowerCase() === value.toLowerCase()) {
            return key;
        }
    }
    return null;
}

class ReplAlliance extends ReplBase {
    constructor(networks, environment = 'development', userAddressBook = require('./addressBook.json')) {
        super();
        this.currentMode = 'none';
        this.networks = networks;
        this.environment = environment;
        this.userAddressBook = userAddressBook;
        this.contractAddressBook = {};
        this.contracts = {};

        this.username = null;
        this.userAddress = null;
        this.userAddressBook.me = null;
        this.setUser(Object.keys(userAddressBook)[0]);

        this.addSolidityTypes();
        this.configureBaseMode();

        const updatePrompt = () => {
            if (this.repl) {
                this.repl.setPrompt(this.username + " @ " + this.currentMode + " > ");
            }
        };
        this.on('user-changed', updatePrompt);
        this.on('mode-changed', updatePrompt);
    }

    start(allContracts, script, config = {}) {
        const network = this.networks[this.environment];
        this.eth = new Eth(new Eth.HttpProvider('http://' + network.host + ':' + network.port), {});

        return this.eth.net_version().then((netId) => {
            this.addContracts(allContracts, netId);
            super.start({
                ...config,
                prompt: this.username + ' @ ' + this.currentMode + ' > '
            });
            if (script) {
                this.runScript(script);
            }
            return this.repl;
        });
    }

    addContractByAddress(name, contractType, address) {
        if (this.contractAddressBook[name]) {
            throw new Error('A contract called ' + name + ' is already known - it is at address ' + this.contractAddressBook[name] + ', will not overwrite with ' + address);
        }
        const solidityTypes = {
            'string': Type.string,
            'bool': Type.boolean,
            'address': this.type.address,
            'uint256': this.type.uint256
        };

        const contract = contractType.at(address);
        this.contractAddressBook[name] = address;

        const abi = contract.abi;

        // can't get this to work reliably....
        //
        // abi.filter((e) => e.type === 'event').forEach(({name:evtName}) => {
        //     const event = contract[evtName];
        //     console.log("Watching " + name +"." + evtName);
        //     const filter = event({ delay:10000 });
        //
        //     filter.new({
        //         "fromBlock": "latest",
        //         "toBlock": "latest"
        //     }).then((...args) => {
        //         console.log('filter id', args, 'created');
        //     });
        //
        //     filter.watch((err, result) => {
        //         if (err) {
        //             console.log('Event error:', err);
        //         } else {
        //             console.log('Event:', name + '.' + evtName, result);
        //             this.repl.displayPrompt(true);
        //         }
        //     });
        // });

        const functions = abi.filter((m) => m.type === 'function');
        const mode = this.addMode(name, new Mode(this.mode('none')));

        functions.map((fn) => {
            mode.add(new Command(
                fn.name,
                fn.inputs.map((input) => solidityTypes[input.type] || solidityTypes.string),
                async function(...args) {
                    return contract[fn.name](...args, {gas: this.gas, from: this.userAddress}).then((result) => {
                        // if it was a transaction, then result is actually a transaction number
                        if (typeof result === 'string') {
                            console.log("Transaction submitted: " + result);
                            this.eth.getTransactionReceipt(result).then((r) => {
                                console.log('\nTransaction completed for ' + fn.name + ', status: ' + r.status + ' used gas: ' + r.cumulativeGasUsed);
                                console.log("Event : " + eabi.logDecoder(abi)(r.logs).map(({_eventName, ...others}) => _eventName + ' : ' + JSON.stringify(others)).join("\n"));
                                this.repl.displayPrompt();
                            }).catch((err) => {
                                console.log("Problem getting transaction result: " +err);
                            });
                            return result;
                        }

                        const renderedResult = fn.outputs.map(({type:outputTypeName}, idx) => {
                            const output = result[idx];
                            const outputType = solidityTypes[outputTypeName];
                            if (outputType) {
                                return outputType.render(output)
                            }
                            return output;
                        });
                        if (renderedResult.length < 2) {
                            return renderedResult[0];
                        }
                        return renderedResult;
                    });
                },
                name + "." + fn.name + (fn.inputs.length === 0 ? "" : " <" + fn.inputs.map((input) => input.name + " " + input.type).join("> <") + ">") + (fn.outputs.length === 0 ? "" : " => <" + fn.outputs.map((output) => output.name + " " + output.type).join("> <") + ">")
            ));
        });
    }

    addContracts(allContracts, netId) {
        allContracts.forEach((contractData) => {
            const name = contractData.contractName;
            const abi = contractData.abi;
            const deployed = contractData.networks;

            const contract = this.eth.contract(abi);
            this.contracts[name] = contract;

            const address = deployed[netId] && deployed[netId].address;
            if (address) {
                this.addContractByAddress(name, contract, address);
            }
        });
    }

    addSolidityTypes() {
        this.type.contract = new Type('contract', (contractName) => {
            const result = this.contracts[contractName];
            if (!result) {
                return {error: contractName + ' was not a contract within this project, available contracts are ' + Object.keys(this.contracts).join(', ') + '.'};
            }
            return {value: result};
        }, () => Object.keys(this.contracts));

        this.type.address = new Type('address', (addressName) => {
            const result = this.userAddressBook[addressName] || this.contractAddressBook[addressName] || addressName;
            if (result.length !== 42) {
                return {error: addressName + ' was not a known address.'};
            }
            return {value: result};
        }, () => [...Object.keys(this.userAddressBook), ...Object.keys(this.contractAddressBook)], (out) => {
            out = out.toString();
            const reverse = reverseLookup(out, this.userAddressBook) || reverseLookup(out, this.contractAddressBook);
            return reverse ?  reverse +  " (" + out + ")" : out;
        });

        this.type.useraddress = new Type('useraddress', (addressName) => {
            const result = this.userAddressBook[addressName] || addressName;
            if (result.length !== 42) {
                return {error: addressName + ' was not a known user.'};
            }
            return {value: result};
        }, () => Object.keys(this.userAddressBook));

        this.type.contractaddress = new Type('contractaddress', (addressName) => {
            const result = this.contractAddressBook[addressName] || addressName;
            if (result.length !== 42) {
                return {error: addressName + ' was not a known contract.'};
            }
            return {value: result};
        }, () => Object.keys(this.contractAddressBook));

        this.type.uint256 = new Type('uint256', (str) => {
            let num = str;
            if (!num.startsWith("0x")) {
                const lastChar = num.substr(-1);
                const prefixNo = "kMGTPEZY".indexOf(lastChar);
                if (prefixNo >= 0) {
                    num = num.substring(0, num.length - 1);
                    let paddingZeros = (prefixNo + 1) * 3;
                    const point = num.indexOf('.');
                    if (point >= 0) {
                        num = num.replace('.', '');
                        paddingZeros -= (num.length - point);
                    }
                    if (paddingZeros < 0) {
                        return {error: str + " used an invalid suffix for its value." };
                    }
                    num = num + "0".repeat(paddingZeros);
                }
            }
            if (uint256regex.test(num)) {
                return {value:num}
            } else {
                return {error: num+' was not a valid uint256.'}
            }
        }, () => [], (val) => {
            let formatted = val.toString();
            if (formatted.length > 18) {
                const lesserPart = formatted.substring(formatted.length - 18).replace(/0*$/, '');
                formatted = formatted.substring(0, formatted.length - 18) + (lesserPart.length > 0 ? '.' : '') + lesserPart + "E";
            }
            return formatted;
        });
    }

    setUser(user) {
        if (this.userAddressBook[user]) {
            this.username = user;
            this.userAddress = this.userAddressBook[user]
        } else {
            this.userAddress = user;
            this.username = reverseLookup(user, this.userAddressBook) || user;
        }
        this.userAddressBook.me = this.userAddress;
        this.emit('user-changed', user);
    }

    configureBaseMode() {
        this.mode()
            .add(Command.exit)
            .add(Command.run)
            .add(Command.comment)
            .add(Command.print)
            .add(this.actions.help)
            .add(this.actions.use)
            .add(new Command('become', [this.type.useraddress], (user) => {
                this.setUser(user);
                console.log("Now acting as " + this.username +".");
            }, "Act as a particular user."))
            .add(new Command('addressBook', [Type.string, this.type.address], (name, address) => this.userAddressBook[name] = address, 'Add an entry into the address book'))
            .add(new Command('addressBook', [], () => console.log("\t" + Object.keys(this.userAddressBook).map((key) => key + "\t" + this.userAddressBook[key]).join("\n\t")), 'Show the entries in the address book'))
            .add(new Command('storeContract', [Type.string, this.type.contract, this.type.address], (name, contract, address) => {
                this.addContractByAddress(name, contract, address);
            }, "Loads a known contract at an address and stores it under the name provided.  This lets you access it with 'use <name>'."));
    }
}

module.exports = ReplAlliance;