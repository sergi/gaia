/* global LazyLoader */
/* global performance */
/* global plog */
/* global utils */

'use strict';

var _xstart = performance.timing.fetchStart -
              performance.timing.navigationStart;
(function(exports) {

  // Only for dev purposes.
  exports.plog = function plog(msg) {
    console.log(msg + ' ' + (performance.now() - _xstart));
  };

  plog('Bootstrap');

  const FIRST_CHUNK = 'firstChunk';

  var _caches = new Map();
  _caches.set(FIRST_CHUNK, {
    containerId: 'groups-list',
    active: false
  });

  var _cachedContacts;
  var _cachedHeaders;

  function setCache(aCache) {
    if (!aCache.id || !aCache.content || !_caches.has(aCache.id)) {
      return;
    }

    localStorage.setItem(aCache.id, JSON.stringify(aCache.content));
  }

  function getCachedContacts(aNodeList) {
    if (!aNodeList) {
      return;
    }

    if (!_cachedContacts) {
      _cachedContacts = new Map();
    }

    for (var i = 0; i < aNodeList.length; i++) {
      _cachedContacts.set(aNodeList[i].dataset.uuid,
                          aNodeList[i].innerHTML);
    }
  }

  function appendNodesToContainer(aContainer, aNodeList) {
    if (!aNodeList.length) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      plog('Appending nodes to container');
      var resolved = false;
      var fragment = document.createDocumentFragment();
      aNodeList.forEach((node) => {
        if (!node.elementName) {
          return;
        }
        var child = document.createElement(node.elementName);
        node.attributes && node.attributes.forEach((attribute) => {
          if (!attribute.name || !attribute.value) {
            return;
          }
          child.setAttribute(attribute.name, attribute.value);
        });
        if (node.innerHTML) {
          child.innerHTML = node.innerHTML;
        }
        fragment.appendChild(child);
        plog('Node appended');

        var headerName = child.id.split('section-group-')[1];
        if (!_cachedHeaders) {
          _cachedHeaders = {};
        }
        _cachedHeaders[headerName] =
          fragment.querySelector('ol#contacts-list-' + headerName);

        if (!resolved) {
          resolve();
        }
      });
      plog('Getting cached contacts');
      getCachedContacts(fragment.querySelectorAll('li[data-cache=true]'));
      plog('Done getting cached contacts. Getting headers');
      plog('Done getting cached headers.');
      aContainer.appendChild(fragment);
      plog('All nodes appended');
    });
  }

  function applyCache(aCacheId) {
    if (!_caches.has(aCacheId)) {
      return Promise.resolve();
    }

    var cache = _caches.get(aCacheId);

    var cacheContent = localStorage.getItem(aCacheId);
    if (!cacheContent) {
      return Promise.resolve();
    }

    try {
      cacheContent = JSON.parse(cacheContent);
      cache.content = cacheContent;
      _caches.set(aCacheId, cache);
    } catch(e) {
      console.error(e);
      return Promise.resolve();
    }

    plog('CACHE content!');

    if (!cache.containerId) {
      return Promise.resolve();
    }

    var container = document.getElementById(cache.containerId);
    if (!container) {
      console.warning('Could not apply cached content to ' +
                      cache.containerId);
      return Promise.resolve();
    }

    return appendNodesToContainer(container, cacheContent).then(() => {
      cache.content = null;
      cache.active = true;
      _caches.set(aCacheId, cache);
      return Promise.resolve();
    });
  }

  var Cache = {
    get active() {
      return _caches.get(FIRST_CHUNK).active;
    },

    set firstChunk(aContent) {
      if (!aContent) {
        return;
      }
      setCache({
        id: FIRST_CHUNK,
        content: aContent
      });
    },

    hasContact: function(aUuid) {
      return (_cachedContacts && _cachedContacts.has(aUuid));
    },

    getContact: function(aUuid) {
      if (!_cachedContacts || !_cachedContacts.has(aUuid)) {
        return;
      }
      var contact = _cachedContacts.get(aUuid);
      // We should get each contact once while rendering the contacts list
      // to see if what we have in the cache is different to what we have in
      // the contacts source (most likely mozContacts). Removing the contact
      // entry from the map allow us to easily check if we have any contact in
      // the cache that was deleted from the original source and so it needs
      // to be removed from the view.
      _cachedContacts.delete(aUuid);
      return contact;
    },

    get contacts() {
      return _cachedContacts ? _cachedContacts.keys() : null;
    },

    get length() {
      return _cachedContacts ? _cachedContacts.size : 0;
    },

    get headers() {
      return _cachedHeaders || {};
    },

    verify: function() {
      // XXX Should check against mozContacts and remove invalid entries.
    },

    cleanup: function() {
      _caches.get(FIRST_CHUNK).content = null;
      _cachedContacts = null;
      _cachedHeaders = null;
    }
  };

  exports.Cache = Cache;

  /** Script loader **/

  function loadScripts() {
  var dependencies = [
     '/contacts/js/activities.js',
     '/shared/js/contacts/utilities/event_listeners.js',
     '/contacts/js/navigation.js',
     '/contacts/js/views/list.js'
    ];
    LazyLoader.load(dependencies, () => {
      ['/shared/js/async_storage.js',
       '/shared/js/contacts/import/utilities/config.js',
       '/contacts/js/utilities/cookie.js',
       '/shared/js/contact_photo_helper.js'
       ].forEach((src) => {
        var scriptNode = document.createElement('script');
        scriptNode.src = src;
        scriptNode.setAttribute('defer', true);
        document.head.appendChild(scriptNode);
      });
      return LazyLoader.load('/contacts/js/contacts.js', () => {
        LazyLoader.load('/shared/js/l10n_date.js');
      });
    }).then(() => {
      plog('Load scripts done');
    });
  }

  /**
   * Bootstrap process
   * -----------------
   *  XXX explain
   */

  window.addEventListener('DOMContentLoaded', function ondomloaded() {
    plog('DOMContentLoaded');
    utils.PerformanceHelper.domLoaded();
    window.removeEventListener('DOMContentLoaded', ondomloaded);

    applyCache(FIRST_CHUNK).then(() => {
      // At this point we can consider the app visually completed so we can
      // send the corresponding performance related events.
      utils.PerformanceHelper.contentInteractive();
    });

    window.onload = () => {
      plog('onload');
      utils.PerformanceHelper.visuallyComplete();
      loadScripts();
    };
  });

})(window);
