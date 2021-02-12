const fs = require('fs');

class Downloaded {
    constructor() {
        try {
            this.data = JSON.parse(fs.readFileSync(`${__dirname}/conf/downloaded.json`, 'utf8'));
        }
        catch (error) {
            console.warn('downloaded.json not found ; it will be created if necessary');
            this.data = {};
        }
    }
    get(interest_id) {
        return this.data[interest_id];
    }
    add_downloaded(interest_id, ep) {
        if (! this.data[interest_id]) {
            this.data[interest_id] = {};
        }
        this.data[interest_id].push(ep);
        fs.writeFileSync(`${__dirname}/conf/downloaded.json`, JSON.stringify(this.data), 'utf8');
    }
    has(interest_id, ep) {
        if (! this.data[interest_id]) return false;
        return this.data[interest_id].includes(ep);
    }
}

module.exports = Downloaded;
