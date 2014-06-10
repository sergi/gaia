'use strict';

document.getElementById('tokenButton').onclick = function() {
  document.getElementById('tokenButton').disabled = true;
  var customMsisdnApn = {
    mnc: 01,
    mcc: 242, // mnc / mcc is used to select correct SIM card
    url: 'http://msisdn.skunk-works.no', // The endpoint that does MSISDN -header injection and returns the token
    apn: { // The APN that will be used to make the data call with the selected SIM card
      apn: 'starenttest',
      carrier: 'custom',
      types: ['default']
    }
  };

  getToken(customMsisdnApn, function(err, token) {
      document.getElementById('tokenButton').disabled = false;
      document.getElementById('error').textContent = err ? err : '';
      document.getElementById('token').textContent = err ? '' : token;
  });
};
