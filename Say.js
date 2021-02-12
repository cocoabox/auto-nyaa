const { exec } = require("child_process");
const { uname } = require('node-uname');

function say(text) {
    switch(uname().sysname.toLowerCase()) {
        case 'darwin':
            exec(`afplay "${__dirname}/pong.wav" && say "${text}"`);
            break;
        case 'linux':
            // TODO : mktemp
            exec(`echo "${text}" | /usr/bin/open_jtalk -g 2.0 -m  "/usr/share/hts-voice/mei/mei_normal.htsvoice"    -x "/var/lib/mecab/dic/open-jtalk/naist-jdic" -ow "/tmp/a.wav" $@ `+
                `&& aplay -q "${__dirname}/pong.wav" && aplay -q "/tmp/a.wav" && rm "/tmp/a.wav" `, (error, stdout, stderr) => {
                    if(error) {
                        console.warn("exec error :", error);
                    }
                });
    }
}

module.exports = say;


