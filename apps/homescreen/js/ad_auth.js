'use strict';
/*globals getToken, decrypt */

var getAdIdentifier = function(url, callback) {
  callback = callback || function noop() {};
  var callbacks = {
    success: function onSuccess(response) {
      callback(null, JSON.parse(response));
    },
    error: function onError(err) {
      callback(err.status || err);
    }
  };

  var options = {
    responseType: 'json',
    requestHeaders: {
      //TODO(olav): Remove when we've got the correct url
      'x-forwarded-proto': 'https',
      'x-fxos-router-proto': 'https'
    },
    operationsTimeout: 60 * 1000
  };

  Rest.get(url, callbacks, options);
};

var getAdToken = function(opts, callback) {
  console.log('entered getAdAuth');
  callback = callback || function noop() {};

  getAdIdentifier(opts.url, function(err, idOpts) {
    if (err) {
      return callback(err);
    }

    console.log('getAdIdentifier returned, entering getToken');
    opts.url = idOpts.url + '?token=' + idOpts.token;
    getToken(opts, function(err, tokenOpts) {
      console.log('getAdAuth and getToken returned', arguments);
      if (err) {
        return callback(err);
      }

      callback(null, decrypt(tokenOpts.encryptedToken, idOpts.key, idOpts.iv));
    });
  });
};

