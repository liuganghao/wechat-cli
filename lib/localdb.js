// var low = require('lowdb')
// var LocalStorage = require('lowdb/adapters/FileAsync')
// var path = require('path');

// async function getdb(dbname) {
//     if (!dbname) dbname = 'db.r.json';
//     if (!dbname.endsWith('.r.json')) dbname = dbname + '.r.json';
//     let adapter = new LocalStorage(path.resolve(__dirname, '..', 'rt', dbname))
//     let db = await low(this.adapter)
// }

// var session = {
//     storage: getdb('session'),
//     get: (key) => {
//         return storage.get(key);
//     },

//     set: (key, data) => {
//         return storage.set(key, data);
//     },

//     remove: (key) => {
//         return new Promise((resolve, reject) => {
//             storage.remove(key, err => {
//                 if (err) {
//                     reject(err);
//                 } else {
//                     resolve();
//                 }
//             });
//         });
//     }
// };
