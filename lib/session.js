const Debug = require('debug');
const debug = Debug('session');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
// const this.storage = require('./localdb').session.db;
const fs = require('fs-extra');
const path = require('path');
// const contacts = require('./contacts');
// const chat = require('./chat');
var low = require('lowdb')
var LocalStorage = require('lowdb/adapters/FileAsync')
const helper = require('./helper');
function getdb(dbname) {
    if (!dbname) dbname = 'db.r.json';
    if (!dbname.endsWith('.r.json')) dbname = dbname + '.r.json';
    let adapter = new LocalStorage(path.resolve(__dirname, '..', 'rt', dbname))
    let db = low(adapter)
    return db;
}
const deviceID = "e" + ('' + Math.random().toFixed(15)).substring(2, 17);

class Session {


    async start() {
        this.storage = await getdb('session');
        this.getCode();
    }

    restart() {
        this.syncKey = [];
        this.auth = null;
        this.avatar = null;
        this.code = '';
        return this.start();
    }
    genSyncKey(list) {
        return (this.syncKey = list.map(e => `${e.Key}_${e.Val}`).join('|'));
    }

    async getCode() {
        var response = await axios.get('https://login.wx.qq.com/jslogin?appid=wx782c26e4c19acffb&redirect_uri=https%3A%2F%2Fwx.qq.com%2Fcgi-bin%2Fmmwebwx-bin%2Fwebwxnewloginpage&fun=new&lang=en_US&_=' + +new Date());
        var code = response.data.match(/[A-Za-z_\-\d]{10}==/)[0];
        debug('successd getCode:' + code);
        this.code = code;
        qrcode.generate('https://login.weixin.qq.com/l/' + code, { small: true })
        console.log('二维码链接：', 'https://login.weixin.qq.com/qrcode/' + code)
        this.check();
        return code;
    }

    async check() {
        // Already logined
        if (this.auth) return;

        var response = await axios.get('https://login.wx.qq.com/cgi-bin/mmwebwx-bin/login', {
            params: {
                loginicon: true,
                uuid: this.code,
                tip: 0,
                r: ~new Date(),
                _: +new Date(),
            }
        });
        let window = {}
        eval(response.data);

        switch (window.code) {
            case 200:
                let authAddress = window.redirect_uri;

                // Set your weChat network route, otherwise you will got a code '1102'
                axios.defaults.baseURL = authAddress.match(/^https:\/\/(.*?)\//)[0];

                delete window.redirect_uri;
                delete window.code;
                delete window.userAvatar;

                // Login success, create session
                let response = await axios.get(authAddress, {
                    params: {
                        fun: 'new',
                        version: 'v2',
                    }
                });
                let auth = {};

                try {
                    auth = {
                        baseURL: axios.defaults.baseURL,
                        skey: response.data.match(/<skey>(.*?)<\/skey>/)[1],
                        passTicket: response.data.match(/<pass_ticket>(.*?)<\/pass_ticket>/)[1],
                        wxsid: response.data.match(/<wxsid>(.*?)<\/wxsid>/)[1],
                        wxuin: response.data.match(/<wxuin>(.*?)<\/wxuin>/)[1],
                    };
                } catch (ex) {
                    debug('Your login may be compromised. For account security, you cannot log in to Web WeChat. You can try mobile WeChat or Windows WeChat.');
                    this.restart();
                }
                if (response.headers['set-cookie'])
                    this.cookie = response.headers['set-cookie']
                this.auth = auth;
                await this.storage.set('auth', auth);
                await this.initUser();
                this.keepalive().catch(ex => {
                    this.logout();
                    throw ex;
                });
                break;

            case 201:
                // Confirm to login
                this.avatar = window.userAvatar;

                let ext = this.avatar.split(';')[0].match(/jpeg|jpg|png|gif/)[0];
                let data = this.avatar.replace(/^data:image\/\w+;base64,/, "").replace(/^data:img\/\w+;base64,/, "");
                let buf = new Buffer(data, 'base64');
                this.avatarurl = path.resolve('rt', 'avatar.' + ext);
                fs.writeFileSync(this.avatarurl, buf);
                console.log('扫码成功')

                console.log(this.avatarurl);
                this.check();
                break;

            case 400:
                // QR Code has expired
                this.restart();
                return;

            default:
                // Continue call server and waite
                this.check();
        }
    }

    async initUser() {
        var response = await axios.post(`/cgi-bin/mmwebwx-bin/webwxinit?r=${-new Date()}&pass_ticket=${this.auth.passTicket}`, {
            BaseRequest: {
                Sid: this.auth.wxsid,
                Uin: this.auth.wxuin,
                Skey: this.auth.skey,
            }
        });

        await axios.post(`/cgi-bin/mmwebwx-bin/webwxstatusnotify?lang=en_US&pass_ticket=${this.auth.passTicket}`, {
            BaseRequest: {
                Sid: this.auth.wxsid,
                Uin: this.auth.wxuin,
                Skey: this.auth.skey,
            },
            ClientMsgId: +new Date(),
            Code: 3,
            fromUserName: response.data.User.UserName,
            ToUserName: response.data.User.UserName,
        });

        this.user = response.data;
        this.user.ContactList.map(e => {
            e.HeadImgUrl = `${axios.defaults.baseURL}${e.HeadImgUrl.substr(1)}`;
        });
        this.contacts = await this.getContacts();
        storage.get('contacts')
            .find({ title: 'low!' })
            .assign({ title: 'hi!' })
            .write()
        await loadChats(this.user.ChatSet);

        return this.user;
    }
    async getContacts() {

        var auth = this.auth;
        var me = this.user.User;
        var response = await axios.post('/cgi-bin/mmwebwx-bin/webwxgetcontact', {
            params: {
                lang: 'zh_CN',
                pass_ticket: auth.passTicket,
                seq: 0,
                skey: auth.skey,
                r: +new Date()
            },
            headers: {
                Cookie: this.cookie
            }
        });

        // Remove all official account and brand account
        let contacts = response.data.MemberList.filter(e => helper.isContact(e, this) && !helper.isOfficial(e) && !helper.isBrand(e)).concat(me);
        contacts.map(e => {
            e.MemberList = [];
            return this.resolveUser(auth, e);
        });

        // this.filtered.result = this.group(contacts);

        return contacts;
    }
    group(list, showall = false) {
        var mappings = {};
        var sorted = [];

        list.map(e => {
            if (!e) {
                return;
            }

            // If 'showall' is false, just show your friends
            if (showall === false
                && !helper.isContact(e)) {
                return;
            }

            var prefix = ((e.RemarkPYInitial || e.PYInitial || pinyin.letter(e.NickName)).toString()[0] + '').replace('?', '#');
            var group = mappings[prefix];

            if (!group) {
                group = mappings[prefix] = [];
            }
            group.push(e);
        });

        for (let key in mappings) {
            sorted.push({
                prefix: key,
                list: mappings[key],
            });
        }

        sorted.sort((a, b) => a.prefix.charCodeAt() - b.prefix.charCodeAt());
        return sorted;
    }
    resolveUser(auth, user) {
        if (helper.isOfficial(user)
            && !helper.isFileHelper(user)) {
            // Skip the official account
            return;
        }

        if (helper.isBrand(user)
            && !helper.isFileHelper(user)) {
            // Skip the brand account, eg: JD.COM
            return;
        }

        if (helper.isChatRoomRemoved(user)
            && !helper.isFileHelper(user)) {
            // Chat room has removed
            return;
        }

        if (helper.isChatRoom(user.UserName)) {
            let placeholder = user.MemberList.map(e => e.NickName).join(',');

            if (user.NickName) {
                user.Signature = placeholder;
            } else {
                user.NickName = placeholder;
                user.Signature = placeholder;
            }
        }

        user.NickName = normalize(user.NickName);
        user.RemarkName = normalize(user.RemarkName);
        user.Signature = normalize(user.Signature);

        user.HeadImgUrl = `${axios.defaults.baseURL}${user.HeadImgUrl.substr(1)}`;
        user.MemberList.map(e => {
            e.NickName = normalize(e.NickName);
            e.RemarkName = normalize(e.RemarkName);
            e.HeadImgUrl = `${axios.defaults.baseURL}cgi-bin/mmwebwx-bin/webwxgeticon?username=${e.UserName}&chatroomid=${user.EncryChatRoomId}&skey=${auth.skey}&seq=0`;
        });

        return user;
    }
    async loadChats(chatSet) {
        var list = contacts.memberList;
        var res = [];
        var temps = [];
        var sorted = [];

        if (!chatSet) return;

        helper.unique(chatSet.split(',')).map(e => {
            var user = list.find(user => user.UserName === e && !helper.isChatRoom(e));

            if (user) {
                res.push(user);
            } else {
                // User not in your contact
                temps.push(e);
            }
        });

        if (temps.length) {
            await contacts.batch(temps);

            temps.map(e => {
                var user = list.find(user => user.UserName === e);

                // Remove all the invalid accounts, eg: Official account
                if (user) {
                    res.push(user);
                }
            });
        }

        res.map((e, index) => {
            this.messages.set(e.UserName, {
                data: [],
                unread: 0,
            });

            // Save the original index to support sticky feature
            e.index = index;

            if (helper.isTop(e)) {
                sorted.unshift(e);
            } else {
                sorted.push(e);
            }
        });

        this.sessions.replace(sorted);
        updateMenus({
            conversations: this.sessions.slice(0, 10),
            contacts: contacts.memberList.filter(e => helper.isContact(e, this)),
        });
        return res;
    }
    async getNewMessage() {
        var auth = this.auth;
        var response = await axios.post(`/cgi-bin/mmwebwx-bin/webwxsync?sid=${auth.wxsid}&skey=${auth.skey}&lang=en_US&pass_ticket=${auth.passTicket}`, {
            BaseRequest: {
                Sid: auth.wxsid,
                Uin: auth.wxuin,
                Skey: auth.skey,
            },
            SyncKey: this.user.SyncKey,
            rr: ~new Date(),
        });
        var mods = [];

        // Refresh the sync keys
        this.user.SyncKey = response.data.SyncCheckKey;
        this.genSyncKey(response.data.SyncCheckKey.List);

        // Get the new friend, or chat room has change
        response.data.ModContactList.map(e => {
            var hasUser = contacts.memberList.find(user => user.UserName === e.UserName);

            if (hasUser) {
                // Just update the user
                contacts.updateUser(e);
            } else {
                // If user not exists put it in batch list
                mods.push(e.UserName);
            }
        });

        // Delete user
        response.data.DelContactList.map((e) => {
            contacts.deleteUser(e.UserName);
            chat.removeChat(e);
        });

        if (mods.length) {
            await contacts.batch(mods, true);
        }

        response.data.AddMsgList.map(e => {
            var from = e.fromUserName;
            var to = e.ToUserName;
            var fromYourPhone = from === this.user.User.UserName && from !== to;

            // When message has been readed on your phone, will receive this message
            if (e.MsgType === 51) {
                return chat.markedRead(fromYourPhone ? from : to);
            }

            e.Content = normalize(e.Content);

            // Sync message from your phone
            if (fromYourPhone) {
                // Message is sync from your phone
                chat.addMessage(e, true);
                return;
            }

            if (from.startsWith('@')) {
                chat.addMessage(e);
            }
        });

        return response.data;
    }

    checkTimeout(weakup) {
        // Kill the zombie request or duplicate request
        this.cancelCheck();
        clearTimeout(this.checkTimeout.timer);

        if (helper.isSuspend() || weakup) {
            return;
        }

        this.checkTimeout.timer = setTimeout(() => {
            this.cancelCheck();
        }, 30 * 1000);
    }

    async keepalive() {
        var auth = this.auth;
        var response = await axios.post(`/cgi-bin/mmwebwx-bin/webwxsync?sid=${auth.wxsid}&skey=${auth.skey}&lang=en_US&pass_ticket=${auth.passTicket}`, {
            BaseRequest: {
                Sid: auth.wxsid,
                Uin: auth.wxuin,
                Skey: auth.skey,
            },
            SyncKey: this.user.SyncKey,
            rr: ~new Date(),
        });
        var host = axios.defaults.baseURL.replace('//', '//webpush.');
        var loop = async () => {
            // Start detect timeout
            this.checkTimeout();

            var response = await axios.get(`${host}cgi-bin/mmwebwx-bin/synccheck`, {
                cancelToken: new CancelToken(exe => {
                    // An executor function receives a cancel function as a parameter
                    this.cancelCheck = exe;
                }),
                params: {
                    r: +new Date(),
                    sid: auth.wxsid,
                    uin: auth.wxuin,
                    skey: auth.skey,
                    synckey: this.syncKey,
                }
            }).catch(ex => {
                if (axios.isCancel(ex)) {
                    loop();
                } else {
                    this.logout();
                }
            });

            if (!response) {
                // Request has been canceled
                return;
            }

            eval(response.data);

            if (+window.synccheck.retcode === 0) {
                // 2, Has new message
                // 6, New friend
                // 4, Conversation refresh ?
                // 7, Exit or enter
                let selector = +window.synccheck.selector;

                if (selector !== 0) {
                    await this.getNewMessage();
                }

                // Do next sync keep your wechat alive
                return loop();
            } else {
                this.logout();
            }
        };

        response.data.AddMsgList.map(async e => {
            await chat.loadChats(e.StatusNotifyUserName);
        });

        this.loading = false;
        this.genSyncKey(response.data.SyncCheckKey.List);

        return loop();
    }

    async hasLogin() {
        var auth = await this.storage.get('auth');

        axios.defaults.baseURL = auth.baseURL;

        this.auth = auth && Object.keys(auth).length ? auth : void 0;

        if (this.auth) {
            await this.initUser().catch(ex => this.logout());
            this.keepalive().catch(ex => this.logout());
        }

        return auth;
    }

    async logout() {
        var auth = this.auth;

        try {
            await axios.post(`/cgi-bin/mmwebwx-bin/webwxlogout?skey=${auth.skey}&redirect=0&type=1`, {
                sid: auth.sid,
                uin: auth.uid,
            });
        } finally {
            this.exit();
        }
    }

    async exit() {
        await this.storage.remove('auth');
        window.location.reload();
    }
}

let session = new Session();
exports = module.exports = session;