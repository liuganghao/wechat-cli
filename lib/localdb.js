var low = require('lowdb')
var LocalStorage = require('lowdb/adapters/FileAsync')
var path = require('path');
class localdb {
    constructor(dbname) {
        if (!dbname) dbname = 'db.r.json';
        if (!dbname.endsWith('.r.json')) dbname = dbname + '.r.json';
        this.adapter = new LocalStorage(path.resolve(__dirname, '..', 'rt', dbname))
        this.db = low(this.adapter)
        //this.db.set('createdon', new Date().toLocaleString()).write()
    }
}
let session = new localdb('session')
let message = new localdb('message')
exports = module.exports ={session,message} 

