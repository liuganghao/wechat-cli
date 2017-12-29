// 导入基本模块
//var wx = require('./lib/session')
// var storage = require('./lib/localdb').message
// var RemoteDB = require('./lib/leandb')
const qs = require('querystring');
const fs = require('fs-extra');
const path = require('path');
const _debug = require('debug')
const debug = _debug('nodecli');
//const setting = require('./rt/demo_turing.json');
const xml2js = require('xml2js');
const api = require('./lib/wxapi')
const emoji = require('./lib/emoji');
var session = {};
const axios = require('axios');
const helper = require('./lib/helper');
const readline = require('readline');
const turingbot = require('./lib/turingBot.js')
var db = { contacts: [], messages: [], chatlist: [] };

const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const mime = require('mime/lite');

// 对Date的扩展，将 Date 转化为指定格式的String
// 月(M)、日(d)、小时(h)、分(m)、秒(s)、季度(q) 可以用 1-2 个占位符， 
// 年(y)可以用 1-4 个占位符，毫秒(S)只能用 1 个占位符(是 1-3 位的数字) 
// 例子： 
// (new Date()).Format("yyyy-MM-dd hh:mm:ss.S") ==> 2006-07-02 08:09:04.423 
// (new Date()).Format("yyyy-M-d h:m:s.S")  ==> 2006-7-2 8:9:4.18 
Date.prototype.Format = function (fmt) { //author: meizz 
    var o = {
        "M+": this.getMonth() + 1, //月份 
        "d+": this.getDate(), //日 
        "h+": this.getHours(), //小时 
        "m+": this.getMinutes(), //分 
        "s+": this.getSeconds(), //秒 
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度 
        "S": this.getMilliseconds() //毫秒 
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}
String.prototype.xmlStr2Obj = function () {
    let xml = this.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    return new Promise(function (resolve, reject) {
        xml2js.parseString(xml, (err, r) => {
            if (err) reject(err);
            else resolve(r);
        })
    })
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
});
async function start() {
    if (fs.existsSync(path.resolve(__dirname, './rt/session.r.json'))) {
        session = require('./rt/session.r.json');
        await refreshContact()
        // if (fs.existsSync(path.resolve(__dirname, './rt/contacts.r.json'))) {
        //     db.contacts = fs.readJsonSync(path.resolve(__dirname, './rt/contacts.r.json'))
        // } else {
        //     refreshContact();
        // }
    }
    if (session && session.pass_ticket) {
        keepalive();
    } else {
        let response = await api.getUUID()
        session.uuid = response.match(/[A-Za-z_\-\d]{10}==/)[0];
        debug('successd getCode:' + session.uuid);
        let rt = await api.showQrCode(session.uuid);
        console.log('[*]', rt.msg);
        console.log('[*]', rt.url);
        waitForLogin(session.uuid);
    }
}

function restart() {
    if (fs.existsSync(path.resolve(__dirname, './rt/session.r.json'))) {
        let sback = require('./rt/session.r.json');
        fs.writeJSONSync(path.resolve(__dirname, './rt/' + sback.auth.User.NickName + '_' + new Date(sback.createdon).Format('yyyyMMddhhmmss') + '.r.json'), sback);
        fs.removeSync(path.resolve(__dirname, './rt/session.r.json'));
        // if (fs.existsSync(path.resolve(__dirname, './rt/' + sback.auth.User.NickName + '.r.json'))) {
        //     let cback = require('./rt/' + sback.auth.User.NickName + '_contacts.r.json');
        //     fs.writeJSONSync(path.resolve(__dirname, './rt/' + sback.auth.User.NickName + '_' + new Date(sback.createdon).Format('yyyyMMddhhmmss') + '_contacts.r.json'), sback);
        //     fs.removeSync(path.resolve('./rt/' + sback.auth.User.NickName + '_contacts.r.json'));
        // }
    }

    session = {};
    return start();
}
async function waitForLogin(code) {
    // Already logined
    if (session && session.pass_ticket) return;
    let response_data = await api.waitForLogin(0, code)
    let window = {}
    eval(response_data);

    switch (window.code) {
        case 200:
            console.log('[*]正在登录...')
            let authAddress = window.redirect_uri.match(/^https:\/\/(.*?)\//)[1];

            // Set your weChat network route, otherwise you will got a code '1102'
            session.host = authAddress;
            axios.default.baseURL = authAddress;
            // Login success, create session
            let rd = await api.login(session, window.redirect_uri);
            try {
                session.skey = rd.match(/<skey>(.*?)<\/skey>/)[1];
                session.pass_ticket = rd.match(/<pass_ticket>(.*?)<\/pass_ticket>/)[1];
                session.wxsid = rd.match(/<wxsid>(.*?)<\/wxsid>/)[1];
                session.wxuin = rd.match(/<wxuin>(.*?)<\/wxuin>/)[1];
            } catch (ex) {
                debug('Your login may be compromised. For account security, you cannot log in to Web WeChat. You can try mobile WeChat or Windows WeChat.');
                restart();
            }
            session.createdon = new Date()
            session.auth = JSON.parse(await api.wxInit(session));
            fs.writeJsonSync('./rt/session.r.json', session);

            db.contacts = session.auth.ContactList;
            db.contacts.forEach(c => {
                c.updatedon = new Date().toLocaleString();
                c.NickName = emoji.parser(c.NickName);
                setRuntimeType(c);
            })

            fs.writeJsonSync('./rt/session.r.json', session);
            await refreshContact();
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
    let loop = async () => {
        let getContact_data = JSON.parse(await api.getContact(session, seq));
        seq = getContact_data.seq;
        getContact_data.MemberList.forEach(c => {
            updateContact(c);
            debug('refreshcontact成功获取联系人：' + c.NickName);
        });

        if (seq)
            loop();
    }
    await loop();
    //fs.writeJsonSync(path.resolve(__dirname, './rt/contacts.r.json'), db.contacts);
    console.log('[*]成功获取联系人:' + db.contacts.length)
    let str = '';
    for (let index = 1; index < db.contacts.length + 1; index++) {
        const c = db.contacts[index - 1];
        c.index = index;
        str += `  ${c.rttype.substr(0, 1).toUpperCase()}(${index})` + c.NickName;
        if (index % 5 == 0) {
            console.log('[*]' + str);
            str = ''
        }
    }
    console.log('[*]' + str);
}

function updateContact(c) {
    let existContact = db.contacts.find(f => c.UserName == f.UserName);
    if (existContact) {
        existContact.updatedon = new Date().toLocaleString();
        //...其他更新
        // existContact.NickName = c.NickName;
        // console.log('更新联系人：' + existContact.NickName + '->' + c.NickName)
    } else {
        existContact = c;
        c.updatedon = new Date().toLocaleString();
        c.NickName = emoji.normalize(c.NickName);
        db.contacts.push(c);
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
        existContact.rttype = 'deletedRoom';
    }
    else if (helper.isContact(existContact, session)) {
        existContact.rttype = 'contact';
    } else {
        existContact.rttype = 'toaddcontact';
        console.error('rttype设置失败：' + JSON.stringify(existContact))
    }
}

async function keepalive() {
    console.log('[*]进入消息监听模式 ... 成功');
    let errcount = 0
    autoReplyText();
    let loop = async () => {
        if (!session || !session.pass_ticket || errcount > 20) {
            return;
        }
        try {
            errcount = 0
            var response_syncCheck_data = await api.syncCheck(session)
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
                    await getNewMessage();
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
        }, 3 * 1000)
    }
    if (await loop() == 'restart')
        restart();
}

async function autoReplyText() {
    let loop = () => {
        setReplyMessage();
        sendMessage();

        setTimeout(() => {
            return loop()
        }, 3 * 1000)
    }
    loop();
}
async function setReplyMessage() {
    db.chatlist.forEach(async (chat) => {
        let data = chat.data;
        let msg = data.msg[data.msg.length - 1];
        if (msg && msg.state == 'received' && msg.type == 'text') {
            let r = await turingbot.reply(msg);
            console.log('to ' + msg.from + ': ' + JSON.stringify(r));
            let msgobj = {
                state: 'sending',
                createdon: new Date(),
                content: r.text,
                type: 'text',
                updatedon: new Date(),
            }
            msgobj.id = new Date().getTime();
            data.msg.push(msgobj)
        }
    })

}
async function sendMessage() {
    db.chatlist.forEach(async (chat) => {
        let data = chat.data;
        data.msg.filter(f => f.state == 'sending').forEach(async (msg) => {
            data.msg.find(f => f.id == msg.id).state = 'completed';
            fs.writeJSONSync(chat.file, chat.data);
            await api.wxSendTextMsg(session, msg.content, session.auth.User.UserName, data.contact.UserName)
        })

    })
    //  await api.wxSendTextMsg(session, r.text, session.auth.User.UserName, data.get('contact').value().UserName)
}

async function resolveMessage(message) {

    message.from = db.contacts.find(f => f.UserName == message.FromUserName);
    message.to = session.auth.User;
    let rt = {
        fromNickName: message.from.NickName,
        toNickName: message.to.NickName,
        fromUserName: message.from.UserName,
        createdon: new Date(message.CreateTime),
        wxid: message.MsgId,
    }
    if (message.ToUserName != session.auth.User.UserName)
        console.error('给我发消息为ToUserName啥不是当前登录用户？？');
    // var isChatRoom = helper.isChatRoom(message.FromUserName);
    // var content = (isChatRoom && !message.isme) ? message.Content.split(':<br/>')[1] : message.Content;

    switch (message.MsgType) {
        case 1:
            // Text message and Location SubMsgType == 48
            if (message.Url && message.OriContent) {
                rt.type = 'location';
                // This message is a location
                let parts = message.Content.split(':<br/>');
                let location = helper.parseKV(message.OriContent);

                location.image = `https://${session.host}/${parts[1]}`.replace(/\/+/g, '/');
                location.href = message.Url;

                message.location = location;

                console.log(message.from.NickName + ' 发送了一个 位置消息 - 我在 ' + message.location.poiname)
                console.log('=======================')
                console.log('= 标题:' + message.location.poiname)
                console.log('= 描述:' + message.location.label)
                console.log('= 链接:' + message.location.href)
                console.log('= 坐标(x,y):' + message.location.x + ' , ' + message.location.y)
                console.log('= 图片:' + message.location.image)
                console.log('=======================')
                rt.content = {
                    poiname: message.location.poiname,
                    label: message.location.label,
                    href: message.location.href,
                    x: message.location.x,
                    y: message.location.y,
                    image: message.location.image
                }

            } else {
                var content = emoji.normalize(message.Content);
                console.log(message.from.NickName + ' ：' + content)
                rt.type = 'text';
                rt.content = content;
            }
            break;
        case 3:
            rt.type = 'image';
            // Image
            let image = helper.parseKV(message.Content);
            //message.image = image;

            let response = await api.getMsgImg(session, message.MsgId);
            fs.ensureDirSync(path.resolve(__dirname, 'rt', new Date().Format('MMdd')))
            let src = path.resolve(__dirname, 'rt', new Date().Format('MMdd'), message.from.NickName + '_' + message.MsgId + '.' + mime.getExtension(response.type))
            fs.writeFileSync(src, response.data);
            message.filepath = src;
            console.log(message.from.NickName + ' 发送了一张图片:' + message.filepath);
            rt.content = {
                filepath: message.filepath
            }
            break;
        case 34:
            rt.type = 'voice';
            // Voice
            let voice = helper.parseKV(content);
            voice.src = `https://${session.host}/cgi-bin/mmwebwx-bin/webwxgetvoice?&msgid=${message.MsgId}&skey=${session.skey}`;
            message.voice = voice;
            console.log(message.from.NickName + ' 发送了一段语音:' + voice.src);
            //todo 
            break;
        case 42:
            rt.type = 'contact';
            // Contact
            let contact = message.RecommendInfo;

            contact.image = `https://${session.host}/cgi-bin/mmwebwx-bin/webwxgeticon?seq=0&username=${contact.UserName}&skey=${session.skey}&msgid=${message.MsgId}`;
            contact.name = contact.NickName;
            contact.address = `${contact.Province || 'UNKNOW'}, ${contact.City || 'UNKNOW'}`;
            message.contact = contact;
            console.log(message.from.NickName + ' 发送了一张名片:');
            console.log('=======================')
            console.log('= 昵称:' + contact.NickName)
            console.log('= 微信号:' + contact.Alias)
            console.log('= 地区:' + contact.Province + ' - ' + contact.City)
            console.log('= 性别:' + ['未知', '男', '女'][contact.Sex])
            console.log('=======================')
            rt.content = {
                NickName: contact.NickName,
                Alias: contact.Alias,
                City: contact.City,
                Province: contact.Province,
                Sex: contact.Sex,
            }
            break;
        case 62:
        case 43:
            rt.type = 'video';
            // Video
            let video = {
                cover: `https://${session.host}/cgi-bin/mmwebwx-bin/webwxgetmsgimg?&MsgId=${message.MsgId}&skey=${session.skey}&type=slave`,
                src: `https://${session.host}/cgi-bin/mmwebwx-bin/webwxgetvideo?msgid=${message.MsgId}&skey=${session.skey}`,
            };
            //todo
            message.video = video;
            console.log(message.from.NickName + ' 发送了一段视频:' + video.src);
            break;
        case 47:
            rt.type = 'emoji';
            // External emoji
            if (!content) break;

            {
                let emoji = helper.parseKV(content);

                emoji.src = `https://${session.host}/cgi-bin/mmwebwx-bin/webwxgetmsgimg?&msgid=${message.MsgId}&skey=${session.skey}`;
                message.emoji = emoji;
                console.log(message.from.NickName + ' 发送了一个动画表情:' + emoji.src);
            }
            //todo
            break;

        case 48:
            console.log(message.from.NickName + ' LOCATION:' + JSON.stringify(message));
            break;
        case 49:
            rt.type = 'transfer';
            switch (message.AppMsgType) {
                case 2000:// Transfer
                    let result = await message.Content.xmlStr2Obj();
                    message.MsgType += 2000;
                    message.transfer = {
                        title: result.msg.appmsg[0].title[0],
                        money: result.msg.appmsg[0].wcpayinfo[0].feedesc[0],
                    };
                    if (result.msg.appmsg[0].wcpayinfo[0].pay_memo && result.msg.appmsg[0].wcpayinfo[0].pay_memo.length > 0) {
                        message.transfer.memo = result.msg.appmsg[0].wcpayinfo[0].pay_memo[0]
                    }
                    console.log(message.from.NickName + ' 转账给您:' + message.transfer.money + ' 备注：' + message.transfer.memo);
                    rt.content = message.transfer;
                    break;
                case 2001:
                    rt.type = 'redpackage';
                    console.log(message.from.NickName + ' 发了个红包给您:' + JSON.stringify(message));
                    break;
                case 17:
                    rt.type = 'locationsharing';
                    // Location sharing...
                    message.MsgType += 17;
                    console.log(JSON.stringify(message));
                    console.log(message.from.NickName + ' REALTIME_SHARE_LOCATION ...');
                    break;
                case 16:
                    rt.type = 'cardticket';
                    console.log(message.from.NickName + ' CARD_TICKET:' + JSON.stringify(message));
                    break;
                case 15:
                    rt.type = 'emtion';
                    console.log(message.from.NickName + ' EMOTION:' + JSON.stringify(message));
                    break;
                case 13:
                    rt.type = 'good';
                    console.log(message.from.NickName + ' GOOD:' + JSON.stringify(message));
                    break;
                case 10:
                    rt.type = 'scangood';
                    console.log(message.from.NickName + ' SCAN_GOOD:' + JSON.stringify(message));
                    break;
                case 9:
                    console.log(message.from.NickName + ' GOOD:' + JSON.stringify(message));
                    break;
                case 8:
                    rt.type = 'animatedemoji'
                    // Animated emoji
                    if (!content) break;

                    {
                        let emoji = helper.parseKV(content) || {};

                        emoji.src = `https://${session.host}/cgi-bin/mmwebwx-bin/webwxgetmsgimg?&msgid=${message.MsgId}&skey=${session.skey}&type=big`;
                        message.MsgType += 8;
                        message.emoji = emoji;
                    }
                    break;
                case 6:
                    rt.type = 'file'
                    // Receive file
                    let file = {
                        name: message.FileName,
                        size: message.FileSize,
                        mediaId: message.MediaId,
                        extension: (message.FileName.match(/\.\w+$/) || [])[0],
                    };
                    // file.uid = await helper.getCookie('wxuin');
                    // file.ticket = await helper.getCookie('webwx_data_ticket');
                    file.download = `${axios.defaults.baseURL.replace(/^https:\/\//, 'https://file.')}cgi-bin/mmwebwx-bin/webwxgetmedia?sender=${message.FromUserName}&mediaid=${file.mediaId}&filename=${file.name}&fromuser=${file.uid}&pass_ticket=undefined&webwx_data_ticket=${file.ticket}`;

                    message.MsgType += 6;
                    message.file = file;
                    message.download = {
                        done: false,
                    };

                    console.log(message.from.NickName + ' 分享了一个文件');
                    console.log('=======================')
                    console.log('= 文件名:' + file.name)
                    console.log('= 文件大小:' + file.size)
                    console.log('= 下载地址:' + file.download)
                    console.log('= 文件类型:' + file.extension)
                    console.log('=======================')
                    rt.content = {
                        name: file.name,
                        size: file.size,
                        path: '',
                        extension: file.extension,
                    }
                    break;
                case 5:
                    console.log(message.from.NickName + ' URL:' + JSON.stringify(message));
                    break;
                case 4:
                    console.log(message.from.NickName + ' VIDEO:' + JSON.stringify(message));
                    break;
                case 3:
                    console.log(message.from.NickName + ' AUDIO:' + JSON.stringify(message));
                    break;
                case 2:
                    console.log(message.from.NickName + ' IMG:' + JSON.stringify(message));
                    break;
                case 1:
                    console.log(message.from.NickName + ' TEXT:' + JSON.stringify(message));
                    break;
                default:
                    rt.type = 'unknow';
                    rt.content = JSON.stringify(message)
                    console.error('Unknow app message: %o', Object.assign({}, message));
                    message.Content = `收到一条暂不支持的消息类型，请在手机上查看（${message.FileName || 'No Title'}）。`;
                    message.MsgType = 19999;
                    break;
            }
            break;
        case 50:
            console.log(message.from.NickName + ' VOIPMSG:' + JSON.stringify(message));
            break;
        case 51:
            console.log(message.from.NickName + ' STATUSNOTIFY:' + JSON.stringify(message));
            break;
        case 52:
            console.log(message.from.NickName + ' VOIPNOTIFY:' + JSON.stringify(message));
            break;
        case 53:
            console.log(message.from.NickName + ' VOIPINVITE:' + JSON.stringify(message));
            break;
        case 10002:
            let text = isChatRoom ? message.Content.split(':<br/>').slice(-1).pop() : message.Content;
            let { value } = helper.parseXml(text, ['replacemsg', 'msgid']);

            if (!settings.blockRecall) {
                self.deleteMessage(message.FromUserName, value.msgid);
            }
            message.Content = value.replacemsg;
            message.MsgType = 19999;
            break;
        case 10000:
            console.log(message.Content);
            // let userid = message.FromUserName;

            // // Refresh the current chat room info
            // if (helper.isChatRoom(userid)) {
            //     let user = await contacts.getUser(userid);

            //     if (userid === self.user.UserName) {
            //         self.chatTo(user);
            //     }

            //     if (members.show
            //         && members.user.UserName === userid) {
            //         members.toggle(true, user);
            //     }
            // }
            break;

        default:
            rt.type = 'unknow';
            rt.content = JSON.stringify(message)
            // Unhandle message
            message.Content = 'Unknow message type: ' + message.MsgType;
            message.MsgType = 19999;
    }

    return rt;
}

async function getNewMessage() {
    let rd = JSON.parse(await api.webWxSync(session));
    let mods = [];

    // Refresh the sync keys
    session.auth.SyncKey = rd.SyncCheckKey;

    // Get the new friend, or chat room has change
    rd.ModContactList.map(c => {
        if (db.contacts.find(f => f.UserName == c.UserName))
            updateContact(c);
        else mods.push(c.UserName)
    });

    // Delete user
    rd.DelContactList.map(c => {
        db.contacts.shift(f => f.UserName == c.UserName);
        console.log('删除联系人：' + c.NickName);
    });

    if (!!mods.length) {
        debug('新增联系人数量：' + mods.length)
        let rp_data = JSON.parse(await api.getContact(session, 0, mods));
        rp_data.MemberList.forEach(c => {
            updateContact(c);
            debug('成功更新联系人：' + c.NickName);
        });
    }

    rd.AddMsgList.map(async (e) => {
        // var from = e.FromUserName;
        // var to = e.ToUserName;
        // var fromYourPhone = from === self.user.User.UserName && from !== to;
        debug(JSON.stringify(e));
        let msg = await resolveMessage(e);
        db.messages.push(e);
        fs.ensureDirSync(path.resolve(__dirname, 'rt', new Date().Format('MMdd')))
        let mpath = path.resolve(__dirname, 'rt', new Date().Format('MMdd'), e.from.NickName.substr(0, 5) + new Date().Format('MMdd') + '.msg.json')
        let mfile = db.chatlist.find(f => f.file == mpath)

        if (!mfile) {
            if (fs.existsSync(mpath)) {
                mfile = {
                    data: fs.readJSONSync(mpath), file: mpath
                };
            } else
                mfile = { from: e.from.NickName, file: mpath, data: { msg: [], contact: { wxid: [] }, memberlist: [] } }
            db.chatlist.push(mfile)
        }
        let data = mfile.data;
        if (data.contact.wxid.length == 0 || !data.contact.wxid.find(f => f == msg.fromUserName)) {
            data.contact.wxid.push(e.from.UserName);
            data.contact.NickName = e.from.NickName;
            data.contact.UserName = e.from.UserName;
            //todo avatar

            //todo getUserInfo
        }
        const msgfromdata = data.msg.find(f => f.id == msg.wxid);
        let msgobj = {
            state: 'received',
            createdon: msg.CreateTime,
            from: e.from.NickName,
            content: msg.content,
            type: msg.type,
            updatedon: new Date(),
        }
        if (!msgfromdata) {

            msgobj.id = msg.wxid;
            data.msg.push(msgobj);
        }
        fs.writeJSONSync(mfile.file, mfile.data);
        // fs.writeJSON('./rt/' + e.from.NickName.substr(0, 5) + e.updatedon.Format('MMdd') + '.msg.json', mlist);
        //db.messages.push(msg);
        //fs.writeJSON('./rt/message.r.json', db.messages);
    });

    return rd;
}


rl.on('line', async (line) => {
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
            db.contacts.filter(f => f.rttype == 'contact').forEach((c, index) => {
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
                session.toUser = db.contacts.find(f => f.index == contactindex);
                rl.setPrompt(session.toUser.NickName + '>');
            }
        }
    } else if (session.toUser) {
        await api.wxSendTextMsg(session, line, session.auth.User.UserName, session.toUser.UserName)
    }
    if (!line.startsWith('[*]'))
        rl.prompt();
}).on('close', () => {
    console.log('Have a great day!');
    process.exit(0);
});

start();