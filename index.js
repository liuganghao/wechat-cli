// 导入基本模块
//var wx = require('./lib/session')
// var storage = require('./lib/localdb').message
// var RemoteDB = require('./lib/leandb')

const fs = require('fs-extra');
const path = require('path');
var _debug = require('debug')
//const setting = require('./rt/demo_turing.json');
const debug = _debug('nodecli')
var api = require('./lib/wxapi')

var session = api.config.rt = {};
const axios = require('axios');

const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'OH AI> '
});


rl.on('line', (line) => {
    switch (line.trim()) {
        case 'hello':
            console.log('world!');
            break;
        default:
            console.log(`Say what? I might have heard '${line.trim()}'`);
            break;
    }
    rl.prompt();
}).on('close', () => {
    console.log('Have a great day!');
    process.exit(0);
});

start();

async function start() {
    let response = await api.getUUID()
    api.config.uuid = response.match(/[A-Za-z_\-\d]{10}==/)[0];
    debug('successd getCode:' + api.config.uuid);
    console.log(await api.showQrCode(api.config.uuid));
    waitForLogin(api.config.uuid);
}

function restart() {
    api.config.wxConfig = {
        skey: '',
        wxsid: '',
        wxuin: '',
        pass_ticket: '',
        host: ''
    };
    api.config.wxCookie = null;
    api.config.rt = {};
    return start();
}

async function waitForLogin(code) {
    // Already logined
    if (session.auth) return;
    let response_data = await api.waitForLogin(0, code)
    let window = {}
    eval(response_data);

    switch (window.code) {
        case 200:
            console.log('正在登录...')
            let authAddress = window.redirect_uri.match(/^https:\/\/(.*?)\//)[1];

            // Set your weChat network route, otherwise you will got a code '1102'
            axios.defaults.baseURL = authAddress;
            api.config.wxConfig.host = authAddress;
            // Login success, create session
            let response = await axios.get(window.redirect_uri, {
                params: {
                    fun: 'new',
                    version: 'v2',
                }
            });
            try {
                api.config.wxConfig.skey = response.data.match(/<skey>(.*?)<\/skey>/)[1];
                api.config.wxConfig.pass_ticket = response.data.match(/<pass_ticket>(.*?)<\/pass_ticket>/)[1];
                api.config.wxConfig.wxsid = response.data.match(/<wxsid>(.*?)<\/wxsid>/)[1];
                api.config.wxConfig.wxuin = response.data.match(/<wxuin>(.*?)<\/wxuin>/)[1];
            } catch (ex) {
                debug('Your login may be compromised. For account security, you cannot log in to Web WeChat. You can try mobile WeChat or Windows WeChat.');
                restart();
            }
            if (response.headers['set-cookie'])
                api.config.wxCookie = response.headers['set-cookie']
            session.user = JSON.parse(await api.wxInit());
            api.config.syncKey = session.user.SyncKey;

            keepalive();
            break;
        case 201:
            // Confirm to login
            session.avatar = window.userAvatar;

            let ext = session.avatar.split(';')[0].match(/jpeg|jpg|png|gif/)[0];
            let data = session.avatar.replace(/^data:image\/\w+;base64,/, "").replace(/^data:img\/\w+;base64,/, "");
            let buf = new Buffer(data, 'base64');
            session.avatarurl = path.resolve('rt', 'avatar.' + ext);
            fs.writeFileSync(session.avatarurl, buf);
            console.log('扫码成功,等待确认')

            console.log('头像:' + session.avatarurl);
            waitForLogin(code);
            break;

        case 400:
            console.log('二维码过期,重启...')
            // QR Code has expired
            restart();
            return;

        default:
            console.log('等待扫码...')
            // Continue call server and waite
            waitForLogin(code);
    }
}

async function keepalive() {
    console.log('[*] 进入消息监听模式 ... 成功');
    let errcount = 0
    let loop = async () => {
        if (!api.config.rt || errcount > 20) {
            return;
        }
        try {
            var response_syncCheck_data = await api.syncCheck()
            let window = {};
            eval(response_syncCheck_data);
            let retcode = +window.synccheck.retcode
            let selector = +window.synccheck.selector;
            debug(`syncCheck.retcode:${retcode}, syncCheck.selector: ${selector}`)
            if (retcode === 1100) {
                console.log('[*] 你在手机上登出了微信，债见')
                api.config.rt = null;
                return;
            } else if (retcode === 1101) {
                console.log('[*] 你在其他地方登录了 WEB 版微信，债见');
                api.config.rt = null;
                return;
            } else if (retcode === 0) {
                // 2, Has new message
                // 6, New friend
                // 4, Conversation refresh ?
                // 7, Exit or enter
                if (selector !== 0) {
                    console.log('[*] 你有新的消息，请注意查收')
                    // await this.getNewMessage();
                }
            }
        } catch (err) {
            console.error(err);
            setTimeout(() => { errcount++; loop() }, 3000)
        }
        setTimeout(() => { loop() }, 1000)
    }
    loop();
}