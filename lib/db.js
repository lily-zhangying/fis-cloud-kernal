'use strict';

var mongo = require('mongoskin');
var db = mongo.db('localhost:8888/test');

var DEFAULT_PERMISSION = {
    owner : {'root' : 1},
    mode : 744
};

var OPERATION_CODE = {
    insert : 2,
    remove : 2,
    update : 2,
    find : 4
};

var COLLECTION_LIST = {
  user : 'user',
  group : 'group',
  resource : 'resource'
};

var exports = module.exports = {};
exports.COLLECTION_LIST = COLLECTION_LIST;

exports.validateUser = function(userid, callback){
    var userobj = {_id: userid};
    db.collection(COLLECTION_LIST.user).findOne(userobj, {_id : true}, function(err, result){
        if(err){
            callback(err);
        }else if(!result){
            err = 'no user';
            callback(err);
        }else{
            callback(null, result);
        }
    });
};

exports.validatePermission = function(collection, query, user, operation, callback){
    db.collection(collection).find(query, {permission:true}).toArray(function(err, item){
        if(err){
            callback(err);
        }else{
            item.forEach(function(i){
                if(!i.permission){
                    i.permission = DEFAULT_PERMISSION;
                }
                var code = i.permission.mode;
                var owner = i.permission.owner;
                var group = i.permission.group;

                var mode_owner = Math.floor(code/100);
                var mode_group = Math.floor((code - mode_owner*100)/10);
                var mode_other = (code - mode_owner*100 - mode_group*10);

                if(owner[user]){
                    var end = mode_owner.toString(2) & operation.toString(2);
                    if(end.toString() !== operation.toString(2)){
                        err = 'no permission';
                        callback(err);
                    }else{
                        callback(null, true);
                    }
                }else if(group){
                    var groupQuery = [];
                    var tmp = {};
                    tmp[user] = 1;
                    groupQuery.push(tmp);
                    db.collection('group').find({$or:groupQuery}, {_id:true}).toArray(function(err, item){
                        if(err){
                            callback(err);
                        }else if(item){
                            var ret = false;
                            item.forEach(function(i){
                                var value = i._id;
                                if(group[value]){
                                    ret = true;
                                }
                            });
                            if(ret){
                                var end = mode_group.toString(2) & operation.toString(2);
                                if(end.toString() !== operation.toString(2)){
                                    ret = false;
                                    err = 'no permission';
                                    callback(err);
                                }
                            }else{
                                var end = mode_other.toString(2) & operation.toString(2);
                                if(end.toString() !== operation.toString(2)){
                                    err = 'no permission';
                                    callback(err);
                                }else{
                                    callback(null, true);
                                }
                            }
                        }
                    });
                }else{
                    var end = mode_other.toString(2) & operation.toString(2);
                    if(end.toString() !== operation.toString(2)){
                        err = 'no permission';
                        callback(err);
                    }else{
                        callback(null, true);
                    }
                }
            });
        }
    });
};

exports.getPermission = function(owner, group, mode, callback){
    var permission = {owner : {}, group : {}, mode: mode || DEFAULT_PERMISSION.mode};
    var groupQuery = [];
    if(owner){
        var owners = Array.isArray(owner) ? owner : [owner];
        owners.forEach(function(o){
           permission.owner[o] = 1;
            var tmp = {};
            tmp[o] = 1;
            groupQuery.push(tmp);
        });
        if(group){
            group = Array.isArray(group) ? group : [group];
            group.forEach(function(g){
               permission.group[g] = 1;
            });
            callback(null, permission);
        }else{
            db.collection(COLLECTION_LIST.group).find({$or:groupQuery}, {_id:true}).toArray(function(err, result){
                if(err){
                    callback(err);
                }else if(!result){
                    callback(null, permission);
                }else{
                    result.forEach(function(g){
                        permission.group[g._id] = 1;
                    });
                    callback(null, permission);
                }
            });
        }
    }else{
        callback(null, DEFAULT_PERMISSION);
    }
};
/**
 *
 * @param collection 插入的集合名，如 user
 * @param userid 进行插入操作的用户id
 * @param docs 插入的单个文档或文档数组
 * @param options {safe:true} safe=true时，doc在数据库插入成功再执行回调函数，为false回调函数立即执行
 * @param callback function(err, records){ err:发生错误的err object，doc是插入的records数组 });
 */
exports.insert = function(collection, userid, docs, options, callback){
    docs = Array.isArray(docs) ? docs : [docs];
    docs.forEach(function(doc){
        if(!doc.permission){
            exports.getPermission(userid, null, null, function(err, result){
               if(err){
                   doc.permission = DEFAULT_PERMISSION;
               }else{
                   doc.permission = result;
                   db.collection(collection).insert(doc, options, callback);
               }
            });
        }else{
            db.collection(collection).insert(doc, options, callback);
        }
    });
};

exports.remove = function(collection, userid, query, options, callback){
    exports.validateUser(userid, function(err, result){
        if(err){
            callback(err);
        }else{
            exports.validatePermission(collection, query, userid, OPERATION_CODE.remove, function(err, result){
                if(err){
                    callback(err);
                }else{
                    db.collection(collection).remove(query, options,callback);
                }
            });
        }
    });
};

exports.update = function(collection, userid, query, update, options, callback){
    exports.validateUser(userid, function(err, result){
        if(err){
            callback(err);
        }else{
            exports.validatePermission(collection, query, userid, OPERATION_CODE.update, function(err, result){
                if(err){
                    callback(err);
                }else{
                    //todo 验证update是否会删除permission
                    db.collection(collection).update(query, update, options, callback);
                }
            });
        }
    });
};

/**
 *
 * @param collection
 * @param userid
 * @param query
 * @param fields
 * @param options
 * @param callback
 */
exports.find = function(collection, userid, query, fields, options, callback){
    exports.validateUser(userid, function(err, result){
       if(err){
           callback(err);
       }else{
           exports.validatePermission(collection, query, userid, OPERATION_CODE.find, function(err, result){
               if(err){
                   callback(err);
               }else{
                   db.collection(collection).find(query, fields, options, callback);
               }
           });
       }
    });
};

exports.findOne = function(collection, userid, query, callback){
    exports.validateUser(userid, function(err, result){
        if(err){
            callback(err);
        }else{
            exports.validatePermission(collection, query, userid, OPERATION_CODE.find, function(err, result){
                if(err){
                    callback(err);
                }else{
                    db.collection(collection).findOne(query, callback);
                }
            });
        }
    });
};



