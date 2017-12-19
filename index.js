// 导入基本模块
var wxCore = require('./lib/wxcore')
var LocalDB = require('./db/localdb')
var RemoteDB = require('./db/leandb')

var _ = require('lodash')
var _debug = require('debug')
var retry = require('async-retry')
const setting = require('./rt/demo_turing.json');
const debug = _debug('nodecli')
const qrcode = require('qrcode-terminal')
const axios = require('axios');

/*微信实现类*/
class nodecli {
    constructor(setting) {
        this.core = new wxCore(setting.wx);
        this.rt = {
            createdon: new Date().toLocaleString(),
            setting: setting
        };
        this.rt.state = 'onstart'
        this.rt.lastSyncTime = 0
        this.rt.syncThreadingId = 0
        this.rt.syncErrorCount = 0
        this.rt.checkThreadingId = 0
        this.rt.retryThreadingId = 0
    }
    async getCode() {
        let self = this;
        let response = await axios.get('https://login.wx.qq.com/jslogin?appid=wx782c26e4c19acffb&redirect_uri=https%3A%2F%2Fwx.qq.com%2Fcgi-bin%2Fmmwebwx-bin%2Fwebwxnewloginpage&fun=new&lang=en_US&_=' + +new Date());
        let code = response.data.match(/[A-Za-z_\-\d]{10}==/)[0];

        self.code = code;
        self.check();
        return code;
    }
    //启动
    async  start() {
        debug('微信启动...');
        //return this._login().then(() => this._init())
        let uuid = await this.getCode();
        this._qrcodegenerate('https://login.weixin.qq.com/l/' + uuid);
        console.log('https://login.weixin.qq.com/qrcode/' + uuid)

        await retry(async () => {
            const checkresult = await this.core.checkLogin();
        })
    }

    _qrcodegenerate(url) {
        qrcode.generate(url, {
            small: true
        });
        // return new Promise((resolve, reject) => {
        //     qrcode.generate('https://login.weixin.qq.com/l/' + uuid, {
        //         small: true
        //     }, function (out) {
        //         console.log(out);
        //         resolve(out);
        //     });
        //     reject();
        // })

    }
    // //重启
    // restart() {
    //     debug('微信重启...')
    //     return this._init().catch(err => {
    //         if (err.response) {
    //             throw err
    //         } else {
    //             let err = new Error('重启出错,三分钟后重启')
    //             debug(err)
    //             //this.emit('error', err)
    //             return new Promise(resolve => {
    //                 setTimeout(resolve, 3 * 60 * 1000)
    //             }).then(() => this.init())
    //         }
    //     }).catch(err => {
    //         debug(err)
    //         //this.emit('error', err)
    //         this.stop()
    //     })
    // }

    // //关闭
    // stop() {
    //     debug('微信登出...')
    //     clearTimeout(this.retryThreadingId)
    //     clearTimeout(this.checkThreadingId)
    //     this.logout()
    //     this.state = 'logout'
    //     //this.emit('logout')
    // }

    // //登录方法
    // _login() {
    //     const checkLogin = () => {
    //         return this.checkLogin().then(result => {
    //             if (result.code === 201 && result.userAvatar) {
    //                 //this.emit('user-avatar', result.userAvatar)
    //             }
    //             let waitcount = 0;
    //             if (result.code !== 200) {
    //                 debug('登录方法(checkLogin):', result.code)
    //                 if (result.code == 408) {
    //                     //this.emit('loginLater')
    //                     if (waitcount < 5)
    //                         setTimeout(() => {
    //                             console.log(waitcount++ + '等待扫码:')
    //                         }, 5 * 1000);
    //                     return;
    //                 }
    //                 return checkLogin()
    //             } else {
    //                 return result
    //             }
    //         })
    //     }

    //     return this.getUUID().then(uuid => {
    //         debug('getUUID: ', uuid)
    //         //this.emit('uuid', uuid)
    //         this.state = 'qrcode'//this.conf.STATE.uuid
    //         return checkLogin()
    //     }).then(result => {
    //         if (result && result.redirect_uri) {
    //             debug('checkLogin:', result.redirect_uri)
    //             return this.login()
    //         }
    //     })
    // }

    // //初始化方法
    // _init() {
    //     return this.init().then(result => {
    //         this.updateContacts(result.ContactList)
    //         this.notifyStates()
    //             .catch(err => //this.emit('error', err))
    //         this._getContact().then(contacts => {
    //             debug('获取联系人数量共：', contacts.length)
    //             this.updateContacts(contacts);
    //         })
    //         this.state = 'login'
    //         this.lastSyncTime = Date.now()
    //         this.syncThreading()
    //         this.checkThreading()
    //         //this.emit('login')
    //     })
    // }

    // //获取联系人
    // _getContact(Seq = 0) {
    //     let contacts = []
    //     return this.getContact(Seq).then(result => {
    //         contacts = result.MemberList || []
    //         if (result.Seq) {
    //             return this._getContact(result.Seq).then(_contacts => contacts = contacts.concat(_contacts || []))
    //         }
    //     }).then(() => {
    //         if (Seq == 0) {
    //             let emptyGroup = contacts.filter(contact => contact.UserName.startsWith('@@') && contact.MemberCount == 0)
    //             if (emptyGroup.length != 0) {
    //                 return this.batchGetContact(emptyGroup).then(_contacts => contacts = contacts.concat(_contacts || []))
    //             }
    //         } else {
    //             return contacts;
    //         }
    //     }).catch(err => {
    //         //this.emit('error', err)
    //         return contacts
    //     })
    // }

    // //同步
    // syncThreading(id = ++this.syncThreadingId) {
    //     if (this.state !== 'login' || this.syncThreadingId !== id) {
    //         return
    //     }
    //     this.syncCheck().then(selector => {
    //         debug('获取消息状态：', selector)
    //         if (+selector !== this.conf.SYNCCHECK_SELECTOR_NORMAL) {
    //             return this.sync().then(data => {
    //                 this.syncErrorCount = 0;
    //                 this.handleSync(data)
    //             })
    //         }
    //     }).then(() => {
    //         this.lastSyncTime = Date.now()
    //         this.syncThreading(id)
    //     }).catch(err => {
    //         if (this.state !== 'login') {
    //             return
    //         }
    //         debug(err)
    //         //this.emit('error', err)
    //         if (++this.syncErrorCount > 2) {
    //             let err = new Error(`连续${this.syncErrorCount}次同步失败，5s后尝试重启`)
    //             debug(err)
    //             //this.emit('error', err)
    //             clearTimeout(this.retryThreadingId)
    //             setTimeout(() => this.restart(), 5 * 1000)
    //         } else {
    //             clearTimeout(this.retryThreadingId)
    //             this.retryThreadingId = setTimeout(() => this.syncThreading(id), 2000 * this.syncErrorCount)
    //         }
    //     })
    // }

    // //检查线程
    // checkThreading() {
    //     if (this.state !== 'login') {
    //         return
    //     }
    //     let interval = Date.now() - this.lastSyncTime
    //     if (interval > 5 * 60 * 1000) {
    //         let err = new Error(`状态同步超过${interval / 1000}s未响应，5s后尝试重启`)
    //         debug(err)
    //         //this.emit('error', err)
    //         clearTimeout(this.checkThreadingId)
    //         setTimeout(() => this.restart(), 5 * 1000)
    //     } else {
    //         debug('心跳')
    //         this.notifyStates()
    //             .catch(err => {
    //                 debug(err)
    //                 //this.emit('error', err)
    //             })
    //         /*this.sendMsg(this._getThreadingMessage(), this._getThreadingTarget())
    //         .catch(err => {
    //           debug(err)
    //           //this.emit('error', err)
    //         })*/
    //         clearTimeout(this.checkThreadingId)
    //         this.checkThreadingId = setTimeout(() => this.checkThreading(), this._getThreadingInterval())
    //     }
    // }

    // //发送消息
    // sendMsg(msg, toUserName) {
    //     if (typeof msg !== 'object') {
    //         return this.sendText(msg, toUserName)
    //     } else if (msg.emoticonMd5) {
    //         return this.sendEmoticon(msg.emoticonMd5, toUserName)
    //     } else {
    //         return this.uploadMedia(msg.file, msg.filename, toUserName)
    //             .then(res => {
    //                 switch (res.ext) {
    //                     case 'bmp':
    //                     case 'jpeg':
    //                     case 'jpg':
    //                     case 'png':
    //                         return this.sendPic(res.mediaId, toUserName)
    //                     case 'gif':
    //                         return this.sendEmoticon(res.mediaId, toUserName)
    //                     case 'mp4':
    //                         return this.sendVideo(res.mediaId, toUserName)
    //                     default:
    //                         return this.sendDoc(res.mediaId, res.name, res.size, res.ext, toUserName)
    //                 }
    //             })
    //     }
    // }

    // //更新联系人
    // updateContacts(contacts) {
    //     if (!contacts || contacts.length == 0) {
    //         return
    //     }
    //     contacts.forEach(contact => {
    //         if (this.contacts[contact.UserName]) {
    //             let oldContact = this.contacts[contact.UserName]
    //             for (let i in contact) {
    //                 contact[i] || delete contact[i]
    //             }
    //             Object.assign(oldContact, contact)
    //             this.Contact.extend(oldContact)
    //         } else {
    //             this.contacts[contact.UserName] = this.Contact.extend(contact)
    //         }
    //     })
    //     //this.emit('contacts-updated', contacts)
    // }

    // //处理同步
    // handleSync(data) {
    //     if (!data) {
    //         this.restart()
    //         return
    //     }
    //     if (data.AddMsgCount) {
    //         debug('syncThreading messages count: ', data.AddMsgCount)
    //         this.handleMsg(data.AddMsgList)
    //     }
    //     if (data.ModContactCount) {
    //         debug('syncThreading ModContactList count: ', data.ModContactCount)
    //         this.updateContacts(data.ModContactList)
    //     }
    // }

    // //处理消息
    // handleMsg(data) {
    //     data.forEach(msg => {
    //         Promise.resolve().then(() => {
    //             if (!this.contacts[msg.FromUserName] ||
    //                 (msg.FromUserName.startsWith('@@') && this.contacts[msg.FromUserName].MemberCount == 0)) {
    //                 return this.batchGetContact([{
    //                     UserName: msg.FromUserName
    //                 }]).then(contacts => {
    //                     this.updateContacts(contacts)
    //                 }).catch(err => {
    //                     debug(err)
    //                     //this.emit('error', err)
    //                 })
    //             }
    //         }).then(() => {
    //             msg = this.Message.extend(msg)
    //             //this.emit('message', msg)
    //             if (msg.MsgType === this.conf.MSGTYPE_STATUSNOTIFY) {
    //                 let userList = msg.StatusNotifyUserName.split(',').filter(UserName => !this.contacts[UserName])
    //                     .map(UserName => {
    //                         return {
    //                             UserName: UserName
    //                         }
    //                     })
    //                 Promise.all(_.chunk(userList, 50).map(list => {
    //                     return this.batchGetContact(list).then(res => {
    //                         debug('batchGetContact data length: ', res.length)
    //                         this.updateContacts(res)
    //                     })
    //                 })).catch(err => {
    //                     debug(err)
    //                     //this.emit('error', err)
    //                 })
    //             }
    //             if (msg.ToUserName === 'filehelper' && msg.Content === '退出' ||
    //                 /^(.\udf1a\u0020\ud83c.){3}$/.test(msg.Content)) {
    //                 this.stop()
    //             }
    //         }).catch(err => {
    //             //this.emit('error', err)
    //             debug(err)
    //         })
    //     })
    // }

    // //图灵机器人
    // replyMessageByTuling(msg, toUserName, nickName) {
    //     var id = toUserName.replace(/[&\|\\\*^%$#@\-]/g, "");
    //     let data = {
    //         'key': this.tulingKey,
    //         'info': msg,
    //         'userid': id,
    //     }
    //     let options = {
    //         method: 'POST',
    //         url: this.conf.API_tulingBot,
    //         data: data,
    //     }
    //     return Promise.resolve().then(() => {
    //         return this.request(options).then(result => {
    //             let data = result.data
    //             //assert.equal(data.code,100000,result)
    //             if (data.code == 100000) {
    //                 //文本类
    //                 let msg = data.text
    //                 return this.sendMsg(msg, toUserName)

    //             } else if (data.code == 200000) {
    //                 //链接类标识码
    //                 let msg = data.text + ' \n ' + data.url
    //                 return this.sendMsg(msg, toUserName)

    //             } else if (data.code == 302000) {
    //                 //新闻类
    //                 let msg = data.text + ' \n '
    //                 for (let key in data.list) {
    //                     msg = msg + data.list[key].article + ' \n '
    //                     msg = msg + data.llist[key].detailurl + ' \n '
    //                 }
    //                 return this.sendMsg(msg, toUserName)
    //             } else if (data.code == 308000) {
    //                 //菜谱类
    //             }

    //         })
    //     }).catch(err => {
    //         err.msg = '图灵机器人加载失败'
    //         throw err
    //     })
    // }

    // _getThreadingMessage() { // Default Threading message
    //     return '心跳：' + new Date().toLocaleString()
    // }

    // _getThreadingInterval() { // Default Threading interval
    //     return 5 * 60 * 1000
    // }

    // _getThreadingTarget() { // Default Threading target user
    //     return 'filehelper'
    // }
}


let client = new nodecli(setting);
client.start();