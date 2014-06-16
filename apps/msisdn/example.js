/**
 * 1. Get identifier, endpoint and keys
 * 2. getToken the encrypted blob
 * 3. decrypt the access token
 * 4. test that it works somehow
 */

document.getElementById('tokenButton').onclick = function() {
  var headerInjectionSettings = {
    mnc: 01,
    mcc: 242, // mnc / mcc is used to select correct SIM card
    url: 'https://fxosad.telenordigital.com/api/client/auth/identify',
    apn: { // The APN that will be used to make the data call with the selected SIM card
      apn: 'starenttest',
      carrier: 'custom',
      types: ['default']
    }
  };

  document.getElementById('tokenButton').disabled = true;

  getAdToken(headerInjectionSettings, function(err, token) {
    document.getElementById('tokenButton').disabled = false;
    document.getElementById('error').textContent = err ? err : '';
    document.getElementById('token').textContent = err ? '' : token;
  });
};
