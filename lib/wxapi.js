'use strict';

// 导入基本模块
var http = require('https');
const fs = require('fs-extra');
const path = require('path');
var request = require('request');
var qs = require('querystring');

var schedule = require('node-schedule');
var xmlreader = require("xmlreader");
var qrcode = require('qrcode-terminal');
var Q = require('q');

/*微信封装方法*/

var deviceID = "e" + ('' + Math.random().toFixed(15)).substring(2, 17);
var config = require('./config');
exports.config = config;
/**
 * 获取用户UUID
 *
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.getUUID = function () {
    return new Promise(function (resolve, reject) {
        config.data = {
            appid: 'wx782c26e4c19acffb',
            fun: 'new',
            lang: 'zh_CN'
        };
        config.options.hostname = config.wxHost.login_host;
        config.options.path = '/jslogin?' + qs.stringify(config.data);
        requestHttps(resolve, reject);
    });
};

/**
 * 显示二维码
 *
 * 可配置wxapi.qrCodeType(png=>图片下载显示，cmd=>终端显示)
 *
 * @param    {string}  uuid     用户uuid
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.showQrCode = function (uuid) {
    return new Promise(function (resolve, reject) {
        // //下载验证码
        // if (wxapi.qrCodeType == 'png') {
        //     request('https://login.weixin.qq.com/qrcode/' + uuid, 'qrcode').pipe(fs.createWriteStream(filename + '.png'));
        //     resolve({ code: 0, msg: "二维码下载成功，请扫描..." });
        // } else if (wechatapi.qrCodeType == 'cmd') {
        qrcode.generate('https://login.weixin.qq.com/l/' + uuid, {
            small: false
        }, function (qrcode) {
            console.log(qrcode);
            resolve({
                url: 'https://login.weixin.qq.com/qrcode/' + uuid,
                msg: '二维码显示成功，请扫描...'
            });
        });
        // } else {
        //     reject({ code: 999, msg: '未设置二维码类型' });
        // }
    });
};

/**
 * 等待用户登陆
 *
 * @param    {int}  tips     扫描标志
 * @param    {string}  uuid  用户uuid
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.waitForLogin = function (tips, uuid) {
    return new Promise(function (resolve, reject) {
        config.data = {
            loginicon: true,
            tip: tips,
            uuid: uuid
        };
        config.options.path = config.wxPath.waitForLogin + '?' + qs.stringify(config.data);
        requestHttps(resolve, reject);
    });
};

/**
 * 初始化
 *
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.wxInit = function (session) {
    return new Promise(function (resolve, reject) {
        config.data = {
            BaseRequest: {
                Uin: session.wxuin,
                Sid: session.wxsid,
                Skey: session.skey,
                DeviceID: deviceID
            }
        };
        config.params = JSON.stringify(config.data);

        config.options.hostname = session.host;
        config.options.path = config.wxPath.wxInit + '?r=' + new Date().getTime() + '&pass_ticket=' + session.pass_ticket + '&skey=' + session.skey;
        config.options.method = 'POST';
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': config.params.length,
            'Cookie': session.cookie
        };
        requestHttps(resolve, reject);
    });
};

/**
 * 登陆
 *
 * @param    {string}  url  登陆链接
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.login = function (session, url) {
    return new Promise(function (resolve, reject) {
        var p = url.match(/com(\S*)/)[1];
        config.options.hostname = session.host;
        config.options.path = p + '&fun=new&version=v2';
        requestHttps(resolve, reject, session);
    });
};

/**
 * 微信状态开启
 *
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.wxStatusNotify = function (session) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        config.options.path = config.wxPath.wxStatusNotify + '?lang=zh_CN&pass_ticket=' + session.pass_ticket;
        config.options.method = 'POST';
        var clientMsgId = (+new Date() + Math.random().toFixed(3)).replace('.', '');
        config.data = {
            BaseRequest: {
                Uin: session.wxuin,
                Sid: session.wxsid,
                Skey: session.skey,
                DeviceID: deviceID
            },
            Code: 3,
            FromUserName: config.rt.authconfig.rt.authName,
            ToUserName: config.rt.authconfig.rt.authName,
            ClientMsgId: clientMsgId
        };

        config.params = JSON.stringify(config.data);
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': config.params.length
        };
        requestHttps(resolve, reject);
    });
};

/**
 * 发送文本消息
 *
 * @param    {string}  content     内容
 * @param    {String}   from         发送人
 * @param    {string}  to   接收人
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.wxSendTextMsg = function (session, content, from, to) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        config.options.path = config.wxPath.webWxSendMsg + '?lang=zh_CN&pass_ticket=' + session.pass_ticket;
        config.options.method = 'POST';
        var id = (+new Date() + Math.random().toFixed(3)).replace('.', '');
        config.data = {
            BaseRequest: {
                Uin: session.wxuin,
                Sid: session.wxsid,
                Skey: session.skey,
                DeviceID: deviceID
            },
            Msg: {
                Type: 1,
                Content: content,
                FromUserName: from,
                ToUserName: to,
                LocalID: id,
                ClientMsgId: id
            }
        };
        config.params = JSON.stringify(config.data);
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': Buffer.byteLength(config.params, 'utf8')
        };
        requestHttps(resolve, reject);
    });
};
/**
 * 获取联系人列表
 * webwxbatchgetcontact
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.getContact = function (session, seq, list) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        config.options.path = config.wxPath.getContact + '?seq' + seq + '&r=' + new Date().getTime() + '&skey=' + session.skey + '&pass_ticket=' + session.pass_ticket;;
        config.options.method = 'POST';
        if (list)
            config.data = {
                BaseRequest: {
                    Uin: session.wxuin,
                    Sid: session.wxsid,
                    Skey: session.skey,
                    DeviceID: deviceID
                },
                Count: list.length,
                List: list.map(e => ({
                    UserName: e,
                    ChatRoomId: ''
                }))
            };
        else
            config.data = {
                BaseRequest: {
                    Uin: session.wxuin,
                    Sid: session.wxsid,
                    Skey: session.skey,
                    DeviceID: deviceID
                }
            };
        config.params = JSON.stringify(config.data);
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': config.params.length,
            'Cookie': session.cookie
        };
        requestHttps(resolve, reject);
    });
};

/**
 * 获取群列表
 *
 * @param    {array}   groupIds         群ID数组
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.getGroupList = function (session, groupIds) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        config.options.path = config.wxPath.getGroupContact + '?type=ex&r=' + new Date().getTime() + '&pass_ticket=' + session.pass_ticket;
        config.options.method = 'POST';
        var Lists = new Array();
        for (var i = 0; i < groupIds.length; i++) {
            var list = {
                UserName: groupIds[i],
                EncryChatRoomId: ''
            };
            Lists.push(list);
        }
        config.data = {
            BaseRequest: {
                Uin: session.wxuin,
                Sid: session.wxsid,
                Skey: session.skey,
                DeviceID: deviceID
            },
            Count: groupIds.length,
            List: Lists
        };
        config.params = JSON.stringify(config.data);
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': config.params.length,
            'Cookie': session.cookie
        };
        requestHttps(resolve, reject);
    });
};

/**
 * 消息检查
 *
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.syncCheck = function (session) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = 'webpush.' + session.host;
        var key = "";
        var keys = session.auth.SyncKey.List;
        for (var o in keys) {
            key = key + '|' + keys[o].Key + '_' + keys[o].Val;
        }
        if (key.length > 1) {
            key = key.substr(1, key.length);
        }
        config.data = {
            uin: session.wxuin,
            sid: session.wxsid,
            skey: session.skey,
            synckey: key,
            deviceid: deviceID,
            _: new Date().getTime(),
            r: new Date().getTime()
        };
        config.options.path = config.wxPath.syncCheck + '?r=' + new Date().getTime() + '&uin=' + session.wxuin + '&sid=' + session.wxsid + '&skey=' + session.skey + '&deviceid=' + deviceID + '&_=' + new Date().getTime() + '&synckey=' + key;
        config.options.method = 'GET';
        config.params = JSON.stringify(config.data);
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': config.params.length,
            'Cookie': session.cookie
        };
        requestHttps(resolve, reject);
    });
};

/**
 * 获取消息同步
 *
 * @param    {string}  address     地址
 * @param    {array}   com         商品数组
 * @param    {string}  pay_status  支付方式
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.webWxSync = function (session) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        config.options.path = config.wxPath.webWxSync + '?sid=' + session.wxsid + '&pass_ticket=' + session.pass_ticket + '&skey=' + session.skey;
        config.options.method = 'POST';
        //var id="e"+ (''+Math.random().toFixed(15)).substring(2, 17);
        var rr = new Date().getTime();
        config.data = {
            BaseRequest: {
                Uin: session.wxuin,
                Sid: session.wxsid,
                Skey: session.skey,
                DeviceID: deviceID
            },
            SyncKey: session.auth.SyncKey,
            rr: ~rr
        };
        config.params = JSON.stringify(config.data);
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': config.params.length,
            'Cookie': session.cookie
        };
        requestHttps(resolve, reject);
    });
};

/**
 * 创建聊天组
 *
 * @param    {string}   topic         是否置顶
 * @param    {array}   memberList         用户数组
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.createChatRoom = function (session, topic, memberList) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        config.options.path = config.wxPath.createChatRoom + '?lang=zh_CN&r=' + new Date().getTime() + '&pass_ticket=' + session.pass_ticket;
        config.options.method = 'POST';

        config.data = {
            BaseRequest: {
                Uin: session.wxuin,
                Sid: session.wxsid,
                Skey: session.skey,
                DeviceID: deviceID
            },
            Topic: topic,
            MemberCount: memberList.length,
            MemberList: memberList
        };
        config.params = JSON.stringify(config.data);
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': config.params.length,
            'Cookie': session.cookie
        };
        requestHttps(resolve, reject);
    });
};

/**
 * 修改聊天组
 *
 * @param    {string}   chatRoomUserName         群Id
 * @param    {array}   memberList         用户数组
 * @returns  void
 *
 * @date     2017-06-28
 * @author   ryan
 */
exports.updateChatRoom = function (session, chatRoomUserName, memberList, fun) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        config.options.path = config.wxPath.updateChatRoom + '?fun=' + fun + '&r=' + new Date().getTime();
        config.options.method = 'POST';
        config.data = {
            BaseRequest: {
                Uin: session.wxuin,
                Sid: session.wxsid,
                Skey: session.skey,
                DeviceID: deviceID
            },
            ChatRoomName: ChatRoomName
        };
        if (fun == 'addmember') {
            config.data.AddMemberList = memberList;
        } else if (fun == 'delmember') {
            config.data.DelMemberList = memberList;
        } else if (fun == 'invitemember') {
            config.data.InviteMemberList = memberList;
        }
        config.params = JSON.stringify(config.data);
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': config.params.length,
            'Cookie': session.cookie
        };
        requestHttps(resolve, reject);
    });
};

/**
 * 获取头像
 *
 * @param    {string}   username         用户名
 * @returns  void
 *
 * @date     2017-06-30
 * @author   ryan
 */
exports.getHeadImg = function (session, username) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        config.options.path = config.wxPath.wxGetHeadImg + '?username=' + username + '&skey=' + session.skey;
        config.options.method = 'GET';
        //var id="e"+ (''+Math.random().toFixed(15)).substring(2, 17);
        var rr = new Date().getTime();
        config.data = {
            BaseRequest: {
                Uin: session.wxuin,
                Sid: session.wxsid,
                Skey: session.skey,
                DeviceID: deviceID
            },
            SyncKey: session.auth.SyncKey,
            rr: ~rr
        };
        config.params = JSON.stringify(config.data);
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': config.params.length
        };
        requestHttps(resolve, reject);
    });
};

/**
 * 消息撤回
 *
 * @param    {string}   msgId         消息Id
 * @param    {string}   toId         发送Id
 * @returns  void
 *
 * @date     2017-06-30
 * @author   ryan
 */
exports.revokeMsg = function (session, msgId, toId) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        config.options.path = config.wxPath.wxRevokeMsg + '?r=' + new Date().getTime();
        config.options.method = 'POST';
        var id = (+new Date() + Math.random().toFixed(3)).replace('.', '');
        config.data = {
            BaseRequest: {
                Uin: session.wxuin,
                Sid: session.wxsid,
                Skey: session.skey,
                DeviceID: deviceID
            },
            ToUserName: toId,
            SvrMsgId: msgId,
            ClientMsgId: id
        };
        config.params = JSON.stringify(config.data);
        config.options.headers = {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': config.params.length
        };
        requestHttps(resolve, reject);
    });
};

/**
 * 推送登陆
 *
 * @param    {string}   uin         uin
 * @returns  void
 *
 * @date     2017-06-30
 * @author   ryan
 */
exports.pushLogin = function (session, uin) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        if (uin) {
            config.options.path = config.wxPath.wxPushLoginUrl + '?uin=' + uin;
        } else {
            config.options.path = config.wxPath.wxPushLoginUrl + '?uin=' + session.wxuin;
        }
        config.options.path = config.wxPath.wxPushLoginUrl + '?uin=' + uin;
        config.options.method = 'GET';
        config.params = "";
        config.options.headers = {};
        requestHttps(resolve, reject);
    });
};

exports.getMsgImg = function (session, message_MsgId) {
    return new Promise(function (resolve, reject) {
        config.options.hostname = session.host;
        config.options.method = 'GET';
        config.options.responseType = 'arraybuffer'
        config.data = {
            MsgID: message_MsgId,
            Skey: session.skey,
        };
        config.options.path = config.wxPath.wxGetMsgImg + '?' + qs.stringify(config.data)
        config.options.headers = {
            'Content-Type': 'image/jpeg',
            'Cookie': session.cookie
        };
        var data = [];
        var req = http.request(config.options, function (res) {
            res.on('data', function (chunk) {
                data.push(chunk);
            });
            res.on('end', function () {
                var statusCode = res.statusCode;
                if (statusCode == 200) {
                    resolve({
                        data: Buffer.concat(data),
                        type: res.headers['content-type']
                    })
                } else {
                    reject(data);
                }
            });
        });
        req.on('error', function (e) {
            reject(e);
        });
        req.end();
    });
}

/*基本网络请求*/
function requestHttps(resolve, reject, session) {
    var req = http.request(config.options, function (res) {
        res.setEncoding('utf-8');
        var headers = res.headers;
        var responseString = '';
        var cookie = headers['set-cookie'];
        if (session && cookie) session.cookie = cookie;
        res.on('data', function (chunk) {
            responseString += chunk;
        });
        res.on('end', function () {
            var statusCode = res.statusCode;
            if (statusCode == 200) {
                resolve(responseString, cookie);
            } else {
                reject(responseString);
            }
        });
    });
    req.on('error', function (e) {
        reject(e);
    });
    req.write(config.params + "\n");
    req.end();
}