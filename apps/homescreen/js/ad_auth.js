var getAdToken = function(opts, callback) {
  if (!callback)
    callback = function noop() {};

  getAdIdentifier(opts.url, function(err, idOpts) {
    if (err)
      return callback(err);

    opts.url = idOpts.url + '?token=' + idOpts.token;
    getToken(opts, function(err, tokenOpts) {
      if (err)
        return callback(err);

      callback(null, decrypt(tokenOpts.encryptedToken, idOpts.key, idOpts.iv));
    });
  });
};

var getAdIdentifier = function(url, callback) {
  if (!callback)
    callback = function noop() {};

  var req = new XMLHttpRequest({mozSystem: true});
  req.open('GET', url, true);
  req.responseType = 'json';

  //TODO(olav): Remove when we've got the correct url
  req.setRequestHeader('x-forwarded-proto', 'https');
  req.setRequestHeader('x-fxos-router-proto', 'https');
  
  req.onload = function() {
    if (this.status >= 400)
      return callback(this.status);

    var response = this.response || JSON.parse(this.responseText);
    callback(null, response);
  };
  req.onerror = function(err) {
    callback(err);
  };
  req.send();
};
