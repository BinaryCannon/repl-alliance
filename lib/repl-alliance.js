const Eth = require('ethjs');
const ReplBase = require('./repl-base/repl-base');
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
    constructor(networks, environment = 'development') {
        super();
        this.networks = networks;
        this.environment = environment;
        this.userAddressBook = require('./addressBook.json');
        this.contractAddressBook = {};
        this.contracts = {};
        this.username = 'alice';
        this.userAddress = this.userAddressBook[this.username];
        this.userAddressBook.me = this.userAddress;
        this.print = false;
        this.currentMode = 'none';

        this.addTypes();
        this.addBaseActions();

        const updatePrompt = () => {
            this.repl.setPrompt(this.username + " @ " + this.currentMode + " > ");
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
                this.runScript(script)
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
        const functions = abi.filter((m) => m.type === 'function');

        const mode = this.addMode(name, new Mode(this.mode('none')));

        functions.map((fn) => {
            mode.add(new Command(
                fn.name,
                fn.inputs.map((input) => solidityTypes[input.type] || solidityTypes.string),
                async (...args) => {
                    return contract[fn.name](...args, {gas: this.gas, from: this.userAddress}).then((result) => {
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
            const address = deployed[netId].address;

            const contract = this.eth.contract(abi);
            this.contracts[name] = contract;

            this.addContractByAddress(name, contract, address);
        });
    }

    addTypes() {
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
        this.type.uint256 = new Type('uint256', (num) => {
            if (uint256regex.test(num)) {
                if (!num.startsWith("0x")) {
                    const lastChar = num.substr(-1);
                    const prefixNo = "kMGTPEZY".indexOf(lastChar);
                    if (prefixNo >= 0) {
                        num = num.substring(0, num.length - 1) + "000".repeat(prefixNo + 1);
                    }
                }
                return {value:num}
            } else {
                return {error: num+' was not a valid uint256.'}
            }
        }, () => []);
    }

    addBaseActions() {
        this.mode()
            .add(Command.exit)
            .add(Command.run)
            .add(Command.comment)
            .add(Command.print)
            .add(this.actions.help)
            .add(this.actions.use)
            .add(new Command('become', [this.type.useraddress], (user) => {
                this.username = reverseLookup(user, this.userAddressBook) || user;
                this.userAddress = user;
                this.userAddressBook.me = this.userAddress;
                this.emit('user-changed', user);
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