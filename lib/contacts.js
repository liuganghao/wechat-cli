
// const { observable, action } =require( 'mobx';
// const { ipcRenderer } =require( 'electron';
const axios =require( 'axios');
const pinyin =require( 'han');

const session =require( './session');
const chat =require( './chat');
const DB = require('./localdb');
const storage = new DB('session');
const helper =require( './helper');
const normalize=require( './emoji').normalize;

class contacts {

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

     async getUser(userid) {
        var user = this.memberList.find(e => e.UserName === userid);

        if (user) {
            return user;
        }

        await this.batch([userid]);
        user = await this.getUser(userid);
        return user;
    }

     async getContats() {
        this.loading = true;

        var auth = await storage.get('auth');
        var me = session.user.User;
        var response = await axios.get('/cgi-bin/mmwebwx-bin/webwxgetcontact', {
            params: {
                r: +new Date(),
                seq: 0,
                skey: auth.skey
            }
        });

        // Remove all official account and brand account
        this.memberList = response.data.MemberList.filter(e => helper.isContact(e) && !helper.isOfficial(e) && !helper.isBrand(e)).concat(me);
        this.memberList.map(e => {
            e.MemberList = [];
            return this.resolveUser(auth, e);
        });

        this.loading = false;
        this.filtered.result = this.group(this.memberList);

        return (window.list = this.memberList);
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

    // Batch get the contacts
    async batch(list) {
        var auth = await storage.get('auth');
        var response = await axios.post(`/cgi-bin/mmwebwx-bin/webwxbatchgetcontact?type=ex&r=${+new Date()}`, {
            BaseRequest: {
                Sid: auth.wxsid,
                Uin: auth.wxuin,
                Skey: auth.skey,
            },
            Count: list.length,
            List: list.map(e => ({
                UserName: e,
                ChatRoomId: ''
            })),
        });

        if (response.data.BaseResponse.Ret === 0) {
            var shouldUpdate = false;

            response.data.ContactList.map(e => {
                var index = this.memberList.findIndex(user => user.UserName === e.UserName);
                var user = this.resolveUser(auth, e);

                if (!user) return;

                shouldUpdate = true;

                if (index !== -1) {
                    this.memberList[index] = user;
                } else {
                    // This contact is not in your contact list, eg: Temprary chat room
                    this.memberList.push(user);
                }
            });

            if (shouldUpdate) {
                // Update contact in menu
                ipcRenderer.send('menu-update', {
                    contacts: JSON.stringify(this.memberList.filter(e => helper.isContact(e))),
                    cookies: await helper.getCookie(),
                });
            }
        } else {
            throw new Error(`Failed to get user: ${list}`);
        }

        return response.data.ContactList;
    }

     filter(text = '', showall = false) {
        text = pinyin.letter(text.toLocaleLowerCase());
        var list = this.memberList.filter(e => {
            var res = pinyin.letter(e.NickName).toLowerCase().indexOf(text) > -1;

            if (e.RemarkName) {
                res = res || pinyin.letter(e.RemarkName).toLowerCase().indexOf(text) > -1;
            }

            return res;
        });

        if (!this.showGroup) {
            list = list.filter(e => {
                return !(e.ContactFlag === 3 && e.SnsFlag === 0);
            });
        }

        this.filtered = {
            query: text,
            result: list.length ? this.group(list, showall) : [],
        };
    }

     toggleGroup(showGroup) {
        this.showGroup = showGroup;
    }

     async deleteUser(id) {
        this.memberList = this.memberList.filter(e => e.UserName !== id);

        // Update contact in menu
        ipcRenderer.send('menu-update', {
            contacts: JSON.stringify(this.memberList.filter(e => helper.isContact(e))),
            cookies: await helper.getCookie(),
        });
    }

     async updateUser(user) {
        var auth = await storage.get('auth');
        var list = this.memberList;
        var index = list.findIndex(e => e.UserName === user.UserName);
        var chating = chat.user;

        // Fix chat room miss user avatar
        user.EncryChatRoomId = list[index]['EncryChatRoomId'];

        user = this.resolveUser(auth, user);

        // Prevent avatar cache
        user.HeadImgUrl = user.HeadImgUrl.replace(/\?\d{13}$/, '') + `?${+new Date()}`;

        if (index !== -1) {
            if (chating
                && user.UserName === chating.UserName) {
                Object.assign(chating, user);
            }

            list[index] = user;
            this.memberList.replace(list);
        }
    }
}


export default contacts;
