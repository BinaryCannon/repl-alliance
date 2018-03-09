class Mode {
    constructor(parentMode) {
        this.parentMode = parentMode;
        this.actions = {};
    }

    add(action) {
        const name = action.name;
        this._defineAction(name, action);
        for (let alias of action.aliases) {
            this._defineAction(alias, action);
        }
        return this;
    }

    allActions() {
        const parentActions = this.parentMode ? this.parentMode.allActions() : [];
        return new Set([...parentActions, ...(Object.keys(this.actions).reduce((result, item) => [...result, ...this.actions[item]], []))]);
    }

    availableActionNames() {
        const parentActions = this.parentMode ? this.parentMode.availableActionNames() : [];
        return [...parentActions, ...Object.keys(this.actions)];
    }

    getActions(actionName) {
        let parentActions = [];
        if (this.parentMode) {
            parentActions = this.parentMode.getActions(actionName);
        }
        return [...(this.actions[actionName] || []), ...parentActions];
    }

    matchingActions(actionName, argParts) {
        const potentialActions = this.getActions(actionName);
        return potentialActions.map((action) => ({action, ...action.parse(argParts)}));
    }

    help(actionName) {
        return Array.from(this.allActions())
            .filter((action) => action.name === actionName || action.aliases.indexOf(actionName) >= 0)
            .map((action) => action.usage())
            .join("\n")
    }

    async exec(repl, actionName, args) {
        const parsed = this.parse(actionName, args);
        if (parsed.errors.length > 0) {
            for (let error of parsed.errors) {
                console.error(error);
            }
        } else if (parsed.action) {
            return parsed.action.action.apply(repl, parsed.arguments);
        }
    }

    suggest(parts) {
        let last = parts.pop() || '';
        let actionName = parts.shift();

        const available = this.availableActionNames();
        if (actionName === undefined) {
            if (available.indexOf(last) >= 0) {
                actionName = last;
                last = "";
            } else {
                return {possibleTerms: available, last};
            }
        }

        const parsed = this.matchingActions(actionName, parts)
            .filter(({errors}) => errors.length === 0);

        if (parsed.length > 0) {
            const parse = parsed[0];
            const types = parse.action.parameterTypes;
            if (types[parts.length]) {
                let suggester = types[parts.length].suggest;
                const possibleTerms = suggester(last);

                if (possibleTerms.indexOf(last) >= 0) {
                    parts.push(last);
                    last = '';
                    if (types[parts.length]) {
                        return {possibleTerms: types[parts.length].suggest(last), last}
                    } else {
                        return {possibleTerms: [], last};
                    }
                }
                return {possibleTerms, last};
            }
        }
        return {possibleTerms: [], last};
    }

    parse(actionName, parts) {
        const potentialActions = this.getActions(actionName);
        if (potentialActions.length === 0) {
            return {errors: ["Action " + actionName + ' not known.\n\tKnown actions are ' + this.availableActionNames().join(', ')]}
        }

        const parsed = this.matchingActions(actionName, parts);
        const failedParses = parsed.filter((parse) => parse.errors.length > 0 || parse.incomplete);
        const successfulParses = parsed.filter((parse) => parse.errors.length === 0 && parse.incomplete === false);

        let errors = [];

        if (successfulParses.length === 1) {
            return successfulParses[0];
        } else if (successfulParses.length > 1) {
            errors = ["Ambiguous command: " + actionName];
        } else {
            errors = failedParses.map((parse) => parse.errors).reduce((result, item) => [...result, ...item], []);
        }
        errors.push(potentialActions.map((action) => action.usage()).join("\n"));
        return {errors};
    }

    _defineAction(name, action) {
        if (this.actions[name] === undefined) {
            this.actions[name] = [];
        }
        this.actions[name].unshift(action);
    }
}

module.exports = Mode;