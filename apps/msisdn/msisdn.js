'use strict';

/**
 * MSISDN forces the use of a specific mobile network and makes a
 * network request using that.
 * It then gets back a token which the sever has mapped to the correct MSISDN.
 *
 * 1. Find the correct sim card
 *    (navigator.mozMobileConnections[xxx].data.network.mcc / mnc)
 * 2. Select the proper APN for that sim card
 *    (modify ril.data.apnSettings[icc_card_number])
 * 3. turn data call ril.data.enabled off
 * 4. Select our sim card as default data sim card (ril.data.defaultServiceId)
 * 5. Turn off wifi: wifi.enabled -> false
 * 6. Turn data call on
 * 7. make request and get token
 * 8. Swap APN settings back to previous state
 * 9. Turn default data sim card back
 * 10. Turn Data call on if it was on before
 * 11. Turn wifi on if it was on before
 * TODO: When I get to test on a DSDS, make sure ril.data.defaultServiceId
 *       settings are correct both under and after call.
 * Usage: getToken({
 *          mcc: 242,
 *          mnc: 01,
 *          url: 'http://msisdn.skunk-works.no',
 *          apn: {
 *            apn: 'starenttest',
 *            carrier: 'custom',
 *            types: ['default']
 *          }
 *        }, function(err, result) {
 *          console.log(err, result);
 *        });
 */
var getToken = (function getTokenImpl(window) {

  function getToken(opts, callback) {
    if (!callback) {
      callback = function noop() {};
    }

    if (!opts || !opts.mcc || !opts.mnc || !opts.apn || !opts.url) {
      return callback('Missing parameters');
    }

    if (!window.navigator.mozMobileConnections.length) {
      return callback('Cannot find ICC interfaces');
    }

    var iccIndex = _getIccIndex(opts.mcc, opts.mnc);

    if (iccIndex < 0) {
      return callback('Correct ICC not found');
    }

    _getSettings([
      'ril.data.apnSettings',
      'ril.data.enabled',
      'ril.data.defaultServiceId',
      'wifi.enabled'
    ], function(defaultSettings) {
      var defaultApn = defaultSettings['ril.data.apnSettings'][iccIndex];
      defaultSettings['ril.data.apnSettings'][iccIndex] = [opts.apn];

      _setSettings({
        'ril.data.apnSettings': defaultSettings['ril.data.apnSettings'],
        'ril.data.enabled': false,
        'ril.data.defaultServiceId': iccIndex,
        'wifi.enabled': false
      });

      // Wait a little for the RIL to close down connection
      setTimeout(function() {
        _setSettings({'ril.data.enabled': true});

        // Wait a little longer for the RIL to start the connection
        setTimeout(function() {
          _request(opts.url, function(err, res) {
            defaultSettings['ril.data.apnSettings'][iccIndex] = defaultApn;
            _setSettings(defaultSettings);

            return callback(err, res);
          });
        }.bind(this), 10000);
      }.bind(this), 2500);
    });
  }

  function _getIccIndex(mcc, mnc) {
    return Array.slice(window.navigator.mozMobileConnections)
      .reduce(function(current, connection, i) {
      if (connection && connection.data && connection.data.network) {
        // For ONCE we're actually using type coercion as it's meant here!
        if (connection.data.network.mcc == mcc &&
            connection.data.network.mnc == mnc) {
          return i;
        }
      }
      return current;
    }, -1);
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

    // TODO(olav): Put this behind build flag for when there is no header injection
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
