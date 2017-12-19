var axios = require('axios')

const getPgv = c => {
  return (c || '') + Math.round(2147483647 * (Math.random() || 0.5)) * (+new Date() % 1E10)
}
var Assert = require('assert')
var _debug = require('debug')
const debug = _debug('util')

function isStandardBrowserEnv(){
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'
  );
}

module.exports.isFunction = val => Object.prototype.toString.call(val) === '[object Function]'

module.exports.convertEmoji = function convertEmoji(s) {
  return s ? s.replace(/<span.*?class="emoji emoji(.*?)"><\/span>/g, (a, b) => {
    switch (b.toLowerCase()) {
      case '1f639':
        b = '1f602'
        break
      case '1f64d':
        b = '1f614'
        break
    }
    try {
      let s = null
      if (b.length === 4 || b.length === 5) {
        s = ['0x' + b]
      } else if (b.length === 8) {
        s = ['0x' + b.slice(0, 4), '0x' + b.slice(4, 8)]
      } else if (b.length === 10) {
        s = ['0x' + b.slice(0, 5), '0x' + b.slice(5, 10)]
      } else {
        throw new Error('unknown emoji characters')
      }
      return String.fromCodePoint.apply(null, s)
    } catch (err) {
      debug(b, err)
      return '*'
    }
  }) : ''
}

module.exports.formatNum = function formatNum(num, length) {
  num = (isNaN(num) ? 0 : num).toString()
  let n = length - num.length

  return n > 0 ? [new Array(n + 1).join('0'), num].join('') : num
}

module.exports.assert = {
  equal(actual, expected, response) {
    try {
      Assert.equal(actual, expected)
    } catch (e) {
      debug(e)
      delete response.request
      e.response = response
      throw e
    }
  },
  notEqual(actual, expected, response) {
    try {
      Assert.notEqual(actual, expected)
    } catch (e) {
      debug(e)
      delete response.request
      e.response = response
      throw e
    }
  },
  ok(actual, response) {
    try {
      Assert.ok(actual)
    } catch (e) {
      debug(e)
      delete response.request
      e.response = response
      throw e
    }
  }
}

module.exports.getClientMsgId = function getClientMsgId() {
  return (Date.now() + Math.random().toFixed(3)).replace('.', '')
}

module.exports.getDeviceID = function getDeviceID() {
  return 'e' + ('' + Math.random().toFixed(15)).substring(2, 17)
}

module.exports.Request = function Request(defaults) {
  defaults = defaults || {}
  defaults.headers = defaults.headers || {}
  if (!isStandardBrowserEnv()) {
    defaults.headers['user-agent'] = defaults.headers['user-agent'] || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.109 Safari/537.36'
    defaults.headers['connection'] = defaults.headers['connection'] || 'close'
  }

  defaults.timeout = 1000 * 60
  defaults.httpAgent = false
  defaults.httpsAgent = false

  this.axios = axios.create(defaults)
  if (!isStandardBrowserEnv()) {
    this.Cookie = defaults.Cookie || {}
    this.Cookie['pgv_pvi'] = getPgv()
    this.Cookie['pgv_si'] = getPgv('s')
    this.axios.interceptors.request.use(config => {
      config.headers['cookie'] = Object.keys(this.Cookie).map(key => {
        return `${key}=${this.Cookie[key]}`
      }).join('; ')
      return config
    }, err => {
      return Promise.reject(err)
    })
    this.axios.interceptors.response.use(res => {
      let setCookie = res.headers['set-cookie']
      if (setCookie) {
        setCookie.forEach(item => {
          let pm = item.match(/^(.+?)\s?\=\s?(.+?);/)
          if (pm) {
            this.Cookie[pm[1]] = pm[2]
          }
        })
      }
      return res
    }, err => {
      if (err && err.response) {
        delete err.response.request
        delete err.response.config
      }
      return Promise.reject(err)
    })
  }

  this.request = options => {
    return this.axios.request(options)
  }

  return this.request
}
