


const axios = require('axios');

//图灵机器人
exports.reply = async (msg) => {
    let r = await axios({
        method: 'POST',
        url: 'http://www.tuling123.com/openapi/api',
        data: {
            'key': 'f6a4b574b35b4da1aa1477ca193bb687',
            'info': msg.content,
            'userid': msg.from,
        }
    });
    return r.data;
}