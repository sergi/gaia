'use strict';

/**
 * MSISDN forces the use of a specific mobile network and makes a
 * network request using that.
 * It then gets back a token which the sever has mapped to the correct MSISDN.
 *
 * 1. turn data call ril.data.enabled off
 * 2. Select our sim card as default data sim card (ril.data.defaultServiceId)
 * 3. Turn off wifi: wifi.enabled -> false
 * 4. Turn data call on
 * 5. make request and get token
 * 6. Turn default data sim card back
 * 7. Turn Data call on if it was on before
 * 8. Turn wifi on if it was on before
 * Usage: getToken({
 *          sims: [0],
 *          url: 'http://msisdn.skunk-works.no',
 *        }, function(err, result) {
 *          console.log(err, result);
 *        });
 */
var getToken = (function getTokenImpl(window) {

  function getToken(opts, callback) {
    if (!callback) {
      callback = function noop() {};
    }

    if (!opts || !opts.sims || !opts.url) {
      return callback('Missing parameters');
    }

    if (!window.navigator.mozMobileConnections.length) {
      return callback('Cannot find ICC interfaces');
    }

    var connection;
    for (var i = 0; i < opts.sims.length; i++) {
      var sim = window.navigator.mozMobileConnections[opts.sims[i].slot];
      if (sim && sim.data && sim.data.network) {
        connection = opts.sims[i];
      }
    }
    if (!connection) {
      return callback('No Data-capable SIM');
    }

    _getSettings([
      'ril.data.enabled',
      'ril.data.defaultServiceId',
      'wifi.enabled'
    ], function(defaultSettings) {
      _setSettings({
        'ril.data.defaultServiceId': opts.sim,
        'wifi.enabled': false,
        'ril.data.enabled': true
      });

      // Wait a little for the RIL to start the connection
      setTimeout(function() {
        _request(opts.url, function(err, res) {
          _setSettings(defaultSettings);

          return callback(err, res);
        });
      }.bind(this), 5000);
    });
  }

  function _setSettings(settings) {
    window.navigator.mozSettings.createLock().set(settings);
  }

  function _getSettings(settings, callback) {
    var numSettings = settings.length, result = {};

    settings.forEach(function(setting) {
      var req = window.navigator.mozSettings.createLock().get(setting);
      req.onsuccess = function() {
        var settingKey = Object.keys(this.result).pop();
        result[settingKey] = this.result[settingKey];

        if (--numSettings <= 0) {
          callback(result);
        }
      };
      req.onerror = function() {
        if (--numSettings <= 0) {
          callback(result);
        }
      };
    });
  }

  function _request(url, callback) {
    var req = new XMLHttpRequest({mozSystem: true});

    req.onload = function() {
      if (this.status >= 400) {
        return callback(this.status);
      }

      callback(null, this.response);
    };

    req.onerror = function() {
      callback('Connection Timeout');
    };

    req.open('GET', url, true);

    req.responseType = 'json';

    // TODO(olav): Put this behind build flag
    if (true) {
      var msisdn = localStorage.getItem('tmp_hack');
      if (!msisdn) {
        msisdn = Math.floor(Math.random() * 100000000).toString();
        localStorage.setItem('tmp_hack', msisdn);
      }
      req.setRequestHeader('msisdn', msisdn);
    }

    req.send();
  }

  return getToken;
})(window);
