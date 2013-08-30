'use strict';

var mongo = require('mongoskin');
var db = mongo.db('localhost:8888/test');
var Q = require('q');

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

var DEFAULT_USER = 'root';

var exports = module.exports = {};
exports.COLLECTION_LIST = COLLECTION_LIST;

function validateUser(userid){
    var userobj = {_id: userid};
    var deferred = Q.defer();
    db.collection(COLLECTION_LIST.user).findOne(userobj, {_id : true}, function(err, result){
        if(err){
            deferred.reject(new Error(err));
        }else if(!result){
            deferred.reject('no user');
        }else{
            deferred.resolve(result);
        }
    });
    return deferred.promise;
};

function validateOperation(mode, operation){
    var end = mode.toString(2) & operation.toString(2);
    var ret = false;
    if(end.toString() === operation.toString(2)){
        ret = true;
    }
    return ret;
};

function _validatePermission(doc, user, operation){
    var defer = Q.defer();
    if(!doc.permission){
        doc.permission = DEFAULT_PERMISSION;
    }
    var code = doc.permission.mode,
        owner = doc.permission.owner,
        group = doc.permission.group,
        mode_owner = Math.floor(code/100),
        mode_group = Math.floor((code - mode_owner*100)/10),
        mode_other = (code - mode_owner*100 - mode_group*10);

    if(owner[user]){
        if(validateOperation(mode_owner, operation)){
            defer.resolve(true);
        }else{
            defer.reject('no permission');
        }
    }else if(group){
        var groupQuery = [];
        var tmp = {};
        tmp[user] = 1;
        groupQuery.push(tmp);
        db.collection('group').find({$or:groupQuery}, {_id:true}).toArray(function(err, item){
            if(err){
                defer.reject(err);
            }else if(item){
                var ret = false;
                item.forEach(function(i){
                    var value = i._id;
                    if(group[value]){
                        ret = true;
                    }
                });
                if(ret){
                    if(validateOperation(mode_group, operation)){
                        defer.resolve(true);
                    }else{
                        defer.reject('no permission');
                    }
                }else{
                    if(validateOperation(mode_other, operation)){
                        defer.resolve(true);
                    }else{
                        defer.reject('no permission');
                    }
                }
            }
        });
    }else{
        if(validateOperation(mode_other, operation)){
            defer.resolve(true);
        }else{
            defer.reject('no permission');
        }
    }
    return defer.promise;
};

function validatePermission(collection, query, user, operation){
    var defer = Q.defer();
    db.collection(collection).find(query, {permission:true}).toArray(function(err, item){
        if(err){
            defer.reject(err);
        }else{
            var ret = true;
            item.forEach(function(i){
                _validatePermission(i, user, operation).
                    then(
                    function(result){ defer.resolve(result);},
                    function(err){ defer.reject(err);});
            });
        }
    });
    return defer.promise;
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
    validateUser(userid).
        then(function(){
            validatePermission(collection, query, userid, OPERATION_CODE.remove).
                then(function(){
                    db.collection(collection).remove(query, options,callback);
                }, function(err){
                    callback(err);
                })
        }).
        fail(function(){
                callback(err);
        }).
        done();
};

exports.update = function(collection, userid, query, update, options, callback){
    validateUser(userid).
        then(function(){
            validatePermission(collection, query, userid, OPERATION_CODE.update).
                then(function(){
                    //todo 验证update是否会删除permission
                    db.collection(collection).update(query, update, options, callback);
                }, function(err){
                    callback(err);
                })
        }).
        fail(function(){
            callback(err);
        }).
        done();
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
    if(!userid || userid == {}){
        userid = DEFAULT_USER;
    }
    validateUser(userid).
        then(function(){
            validatePermission(collection, query, userid, OPERATION_CODE.find).
                then(function(){
                    db.collection(collection).find(query, fields, options, callback);
                }, function(err){
                    callback(err);
                })
        }).
        fail(function(err){
            callback(err);
        }).
        done();
};

exports.findOne = function(collection, userid, query, callback){
    validateUser(userid).
        then(function(){
            validatePermission(collection, query, userid, OPERATION_CODE.find)
                .then(function(){
                        db.collection(collection).findOne(query, callback);
                    }, function(err){
                    callback(err);
                }
        )}).
        fail(function(err){
            callback(err);
        }).
        done();
};



