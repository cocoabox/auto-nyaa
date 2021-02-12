const fs = require('fs');

class Conf {
    constructor() {
        this.data = JSON.parse(fs.readFileSync(`${__dirname}/conf/config.json`, 'utf8'));
    }
    get(root_key) {
        return this.data[root_key];
    }
}

module.exports = Conf;
