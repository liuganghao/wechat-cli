// 导入基本模块
var wx = require('./lib/session')
var storage = require('./lib/localdb').message
var RemoteDB = require('./lib/leandb')

var _ = require('lodash')
var _debug = require('debug')
var retry = require('async-retry')
const setting = require('./rt/demo_turing.json');
const debug = _debug('nodecli')
const qrcode = require('qrcode-terminal')
const axios = require('axios');

wx.start();