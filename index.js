// 导入基本模块
//var wx = require('./lib/session')
// var storage = require('./lib/localdb').message
// var RemoteDB = require('./lib/leandb')

const fs = require('fs-extra');
const path = require('path');
const _debug = require('debug')
//const setting = require('./rt/demo_turing.json');

const api = require('./lib/wxapi')
const emoji = require('./lib/emoji');
const session = api.config.rt;
const axios = require('axios');
const helper = require('./lib/helper');
const readline = require('readline');

const debug = _debug('nodecli')
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
});
async function start() {
    if (api.config.wxConfig && api.config.wxConfig.pass_ticket) {
        keepalive();
    } else {
        let response = await api.getUUID()
        api.config.uuid = response.match(/[A-Za-z_\-\d]{10}==/)[0];
        debug('successd getCode:' + api.config.uuid);
        let rt = await api.showQrCode(api.config.uuid);
        console.log('[*]', rt.msg);
        console.log('[*]', rt.url);

        waitForLogin(api.config.uuid);
    }
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
    session.auth = {}
    session.contacts = [];
    session.toUser = ''
    return start();
}
async function waitForLogin(code) {
    // Already logined
    if (api.config.pass_ticket) return;
    let response_data = await api.waitForLogin(0, code)
    let window = {}
    eval(response_data);

    switch (window.code) {
        case 200:
            console.log('[*]正在登录...')
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
            session.auth = JSON.parse(await api.wxInit());
            session.contacts = session.auth.ContactList;
            session.contacts.forEach(c => {
                c.updatedon = new Date().toLocaleString();
                c.NickName = emoji.parser(c.NickName);
                setRuntimeType(c);
            })
            api.config.syncKey = session.auth.SyncKey;
            fs.writeJsonSync('./rt/config.r.json', api.config);
            refreshContact();
            keepalive();
            break;
        case 201:
            // Confirm to login
            //session.avatar = window.userAvatar;

            let ext = window.userAvatar.split(';')[0].match(/jpeg|jpg|png|gif/)[0];
            let data = window.userAvatar.replace(/^data:image\/\w+;base64,/, "").replace(/^data:img\/\w+;base64,/, "");
            let buf = new Buffer(data, 'base64');
            session.avatarurl = path.resolve('rt', 'avatar.' + ext);
            fs.writeFileSync(session.avatarurl, buf);
            console.log('[*]扫码成功,等待确认')

            console.log('[*]头像:' + session.avatarurl);
            waitForLogin(code);
            break;

        case 400:
            console.log('[*]二维码过期,重启...')
            // QR Code has expired
            restart();
            return;

        default:
            console.log('[*]等待扫码...')
            // Continue call server and waite
            waitForLogin(code);
    }
}
async function refreshContact() {
    let seq = 0;
    let loop = async() => {
        let getContact_data = JSON.parse(await api.getContact(seq));
        seq = getContact_data.seq
        getContact_data.MemberList.forEach(c => {
            updateContact(c);
            debug('refreshcontact成功获取联系人：' + c.NickName);
        });

        if (seq)
            loop();
    }
    await loop();
    console.log('[*]成功获取联系人:' + session.contacts.length)
    let str = '';
    for (let index = 1; index < session.contacts.length + 1; index++) {
        const c = session.contacts[index - 1];
        c.index = index;
        str += `  ${c.rttype.substr(0,1).toUpperCase()}(${index})` + c.NickName;
        if (index % 5 == 0) {
            console.log('[*]' + str);
            str = ''
        }
    }
    console.log('[*]' + str);
}

function updateContact(c) {
    let existContact = session.contacts.find(f => c.UserName == f.UserName);
    if (existContact) {
        existContact.updatedon = new Date().toLocaleString();
        //...其他更新
        // existContact.NickName = c.NickName;
        // console.log('更新联系人：' + existContact.NickName + '->' + c.NickName)
    } else {
        existContact = c;
        c.updatedon = new Date().toLocaleString();
        c.NickName = emoji.normalize(c.NickName);
        session.contacts.push(c);
    }
    setRuntimeType(existContact);
}

function setRuntimeType(existContact) {
    if (helper.isSpecialUsers(existContact)) {
        existContact.rttype = 'special';
    } else if (helper.isOfficial(existContact)) {
        existContact.rttype = 'official';
    } else if (helper.isBrand(existContact)) {
        existContact.rttype = 'brand';
    } else if (helper.isChatRoom(existContact)) {
        existContact.rttype = 'room';
    } else if (helper.isChatRoomRemoved(existContact)) {
        existContact.rttype = 'roomRemoved';
    } else if (helper.isContact(existContact, session)) {
        existContact.rttype = 'contact';
    }
}

async function keepalive() {
    console.log('[*]进入消息监听模式 ... 成功');
    let errcount = 0
    let loop = async() => {
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
                console.log('[*]你在手机上登出了微信，债见')
                return 'restart'
            } else if (retcode === 1101) {
                console.log('[*]你在其他地方登录了 WEB 版微信，债见');
                return 'restart'
            } else if (retcode === 0) {
                // 2, Has new message
                // 6, New friend
                // 4, Conversation refresh ?
                // 7, Exit or enter
                if (selector == 2) {
                    console.log('[*]你有新的消息，请注意查收')
                    // await this.getNewMessage();
                } else if (selector == 6) {
                    console.log('[*] 收到疑似红包消息')
                } else if (selector == 7) {
                    console.log('[*] 你在手机上玩微信被我发现了')
                } else if (selector == 0) {
                    //console.log('[*] 收到疑似红包消息')
                } else {
                    console.log('[*] 这个消息无法处理retcode:0,selector:' + selector)
                }
            }
        } catch (err) {
            console.error(err);
            setTimeout(() => {
                errcount++;
                return loop()
            }, 3000)
        }
        setTimeout(() => {
            return loop()
        }, 60 * 1000)
    }
    if (await loop() == 'restart')
        restart();
}

async function getNewMessage() {
    let auth = session.auth;
    let response = await api.webWxSync();
    let mods = [];

    // Refresh the sync keys
    api.config.SyncKey = response.data.SyncCheckKey;

    // Get the new friend, or chat room has change
    response.data.ModContactList.map(c => {
        if (session.contacts.find(f => f.UserName == c.UserName))
            updateContact(c);
        else mods.push(c.UserName)
    });

    // Delete user
    response.data.DelContactList.map(c => {
        session.contacts.shift(f => f.UserName == c.UserName);
        console.log('删除联系人：' + c.NickName);
    });

    if (mods.length) {
        debug('新增联系人数量：' + mods.length)
        let rp_data = JSON.parse(await api.getContact(0, mods));
        rp_data.MemberList.forEach(c => {
            updateContact(c);
            debug('成功更新联系人：' + c.NickName);
        });
    }

    response.data.AddMsgList.map(e => {
        var from = e.FromUserName;
        var to = e.ToUserName;
        var fromYourPhone = from === self.user.User.UserName && from !== to;

        e.Content = emoji.normalize(e.Content);

        console.log(JSON.stringify(e));
    });

    return response.data;
}


rl.on('line', async(line) => {
    switch (line.toLowerCase().trim()) {
        case '#':
            rl.setPrompt('> ');
            session.toUser = null;
            return
        case '#restart':
            restart();
            return
        case '#rc':
            refreshContact();
            return
        case '#hello':
            console.log('world!');
            return
        default:
            console.log(`Say what? I might have heard '${line.trim()}'`);
    }
    if (line.toLowerCase().startsWith('#c')) {
        if (line.toLowerCase() == '#c') {
            let str = '';
            session.contacts.filter(f => f.rttype == 'contact').forEach((c, index) => {
                str += `  (${c.index})` + c.NickName;
                if (index % 5 == 1) {
                    console.log('[*]' + str);
                    str = ''
                }
            })
            console.log('[*]' + str);
        } else {
            let contactindex = parseInt(line.substr(2));
            if (contactindex >= 0) {
                session.toUser = session.contacts.find(f => f.index == contactindex);
                rl.setPrompt(session.toUser.NickName + '>');
            }
        }
    } else if (session.toUser) {
        await api.wxSendTextMsg(line, session.auth.User.UserName, session.toUser.UserName)
    }
    if (!line.startsWith('[*]'))
        rl.prompt();
}).on('close', () => {
    console.log('Have a great day!');
    process.exit(0);
});

start();