'use strict';

/*global GridManager MozActivity dump */
(function(exports) {

  var ScrollDirection = {
    BACKWARD: 0,
    FORWARD: 1
  };

  var AdManager = exports.AdManager = function(adView) {
    this.currentAds = [];
    this.view = adView;

    this.adsUrl = 'http://fxosad.telenordigital.com/api/client/data';
    this.analyticsUrl = 'http://fxosad.telenordigital.com/api/client/click';

    document.addEventListener('ad-activated', this.sendAnalytics.bind(this));
    document.addEventListener('online', this.fetchAds.bind(this));
  };

  AdManager.prototype.sendAnalytics = function(event) {
    /* Flow:
     * 1. Try to send.
     * 2a. if success: Check if there are old ones and send those.
     * 2b. if error: store in local storage.
     */
    var self = this;
    if (event) {
      this.sendNetworkRequest('POST', this.analyticsUrl, event.detail)
        .then(self.sendAnalytics(), self.storeAnalytics(event));
    } else {
      // Check if there are old events in the database which can be sent.
    }
  };

  AdManager.prototype.storeAnalytics = function(event) {
    console.log(event);
  };

  AdManager.prototype.loadFile = function (file, successCallback, errorCallback) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.overrideMimeType('application/json');
      xhr.open('GET', file, true);
      xhr.send(null);

      xhr.onload = function (event) {
        try {
          successCallback(JSON.parse(xhr.responseText));
        } catch (e) {
          errorCallback && errorCallback(e);
        }
      };

      xhr.onerror = function _xhrOnError(evt) {
        errorCallback && errorCallback('file not found');
      };
    } catch (ex) {
      errorCallback && errorCallback(ex);
    }
  }

  AdManager.prototype.sendNetworkRequest = function(type, url, data) {
    return new Promise(function(resolve, reject) {
      var req = new XMLHttpRequest({mozSystem: true});
      req.open(type, url);

      req.onload = function() {
        if (req.status == 200) {
          resolve(req.response);
        }
        else {
          reject(Error(req.statusText));
        }
      };

      req.onerror = function() {
        reject(Error('Network Error'));
      };

      if (type === 'POST') {
        req.setRequestHeader('Content-Type', 'application/json');
        req.send(JSON.stringify(data));
      } else {
        req.send();
      }
    });
  }

  AdManager.prototype.fetchAds = function() {
    var self = this;
    this.sendNetworkRequest('GET', this.adsUrl).then(function (response) {
      self.manageAds(JSON.parse(response));
    });
  };

  AdManager.prototype.fetchImage = function(url) {
    /* Flow:
     * 1. Check if the image is on the device.
     * 2a. if success: return the old one.
     * 2b. if not available: download new one.
     * 2ba. if success: Store in DB and return local.
     * 2bb. if error: reject this ad.
     */
  }

  AdManager.prototype.manageAds = function(ads) {
    var advertisements = ads.advertisements;

    var validAds = {};
    validAds.advertisements = [];
    // Make sure the ads are valid in this function.
    for (var i = 0; i < advertisements.length; i++) {
      if (advertisements[i].image) {
        validAds.advertisements.push(advertisements[i]);
      } else {
        console.log('No valid image for ad: ' + advertisements[i].id);
      }
    }

    this.currentAds = validAds;
    asyncStorage.setItem('Telenor-ads', this.currentAds);
    this.view.setAds(this.currentAds);
  };

  AdManager.prototype.setupAds = function() {
    var self = this;
    // Load all ads from the database on phone boot, if there are none, load the json file.
    asyncStorage.getItem('Telenor-ads', function(ads) {
      if (ads) {
        self.manageAds(ads)
      } else {
        self.loadFile('js/preloadedads.json', function(preloadedAds) {
            self.currentAds = preloadedAds;
            self.view.setAds(self.currentAds);
          },
          function() {console.log('Error loading preloaded ads')});
      }
      self.fetchAds();
    });
  };

  AdManager.prototype.removeAd = function(adId) {
    // Remove the images from an old ad from the DB.
  };

  var AdView = exports.AdView =  function(gridManager) {
    this.summaryContainer = document.createElement('div');
    this.summaryContainer.id = 'summaryContainer';
    this.detailsContainer = document.createElement('div');
    this.detailsContainer.id = 'detailsContainer';
    this.detailsWrapper = document.createElement('div');
    this.detailsWrapper.id = 'detailsWrapper';

    this.cardsList = [];
    this.dataStore = null;
    this.deviceId = null;
    this.gridManager = gridManager;
  };

  AdView.prototype.createAdPage = function() {
    var self = this;

    // Insert the page
    this.gridManager.pageHelper.addPage([], 0, 0);
    this.gridManager.globalPageOffset(1);
    // Then get the page (which will be at index 1)
    var page = this.gridManager.pageHelper.getPage(1);
    // Dont save this page as its dynamic
    page.ignoreOnSave = true;

    // And grab the element so we can do stuff with it
    var el = this.gridManager.container.firstChild;
    el.classList.add('ad-page');

    var startEvent, currentX, currentY, startX, startY, dx, dy,
        detecting = false, swiping = false, scrolling = false,
        details = false, scrollDirection;

    el.addEventListener('gridpageshowend', function(e) {
        document.querySelector('#footer').style.transform = 'translateY(100%)';
    });
    el.addEventListener('gridpagehideend', function(e) {
        document.querySelector('#footer').style.transform = '';
    });

    el.addEventListener('touchstart', function(e) {
      startEvent = e;
      swiping = false;
      detecting = true;
      startX = startEvent.touches[0].pageX;
      startY = startEvent.touches[0].pageY;
    });
    el.addEventListener('touchmove', function(e) {
      if (details) {
        e.preventDefault();
      }
      if (detecting || scrolling) {
        e.preventPanning = true;
      }
      if (detecting) {
        currentX = e.touches[0].pageX;
        currentY = e.touches[0].pageY;
        dx = currentX - startX;
        dy = currentY - startY;
        if (dx < -25 && (dy > -15 || dy < 15)) {
          detecting = scrolling = false;
          swiping = true;
        } else if (dx > -25 && (dy < -15 || dy > 15)) {
          detecting = false;
          scrolling = true;
          if (dy < -15) {
            scrollDirection = ScrollDirection.FORWARD;
          } else {
            scrollDirection = ScrollDirection.BACKWARD;
          }
        }
      }
    });
    el.addEventListener('touchend', function(e) {
      if (swiping === false && scrolling === false) {
        if (details === false) {
          var card = e.target.dataset.cardIndex;
          if (card) {
            self.openDetails(card);
            details = true;
          }
        } else {
          self.closeDetails();
          details = false;
        }
      } else if (scrolling === true && details === true) {
        var card = self.currentCard;
        card = scrollDirection === ScrollDirection.FORWARD ? card + 1 : card - 1;
        if (card >= 0 && card < self.cardsList.length) {
          self.showCardDetails(card);
        }
      }
      detecting = scrolling = false;
    });

    this.createCards();

    el.appendChild(this.summaryContainer);
    this.detailsContainer.appendChild(this.detailsWrapper);
    el.appendChild(this.detailsContainer);

    return el;
  };

  AdView.prototype.createCards = function() {
    var operatorCard = new OperatorCard();
    this.summaryContainer.appendChild(operatorCard.domElement);
  };

  AdView.prototype.setAds = function(adsData) {
    var ads = adsData.advertisements;
    var currentCards = document.querySelectorAll('#summaryContainer > .card');
    var cardCount = currentCards.length;
    for (var i = ads.length; i < cardCount; i++) {
      // Remove some excess cards.
      var card = this.cardsList.pop();
      card.ad.summaryElement.parentNode.removeChild(card.ad.summaryElement);
      card.ad.detailElement.parentNode.removeChild(card.ad.detailElement);
    }
    for (var i = cardCount; i < ads.length; i++) {
      // Add some extra cards.
      var card = {};
      card.ad = new Ad(i);
      this.cardsList.push(card);
      this.summaryContainer.appendChild(card.ad.summaryElement);
      this.detailsWrapper.appendChild(card.ad.detailElement);
    }

    for (var i = 0; i < ads.length; i++) {
      this.cardsList[i].ad.setData(ads[i]);
    }
  };

  AdView.prototype.showCardDetails = function(card) {
    this.currentCard = card-0;
    var translateOffset = card === '0' ? 0 : (card * -395) + 20;
    this.detailsWrapper.style.transform = 'translateY(' + translateOffset + 'px)';
  };

  AdView.prototype.openDetails = function(card) {
    this.showCardDetails(card);
    this.detailsContainer.classList.add('active');
    setTimeout(function() {
      self.detailsWrapper.classList.add('active');
    }, 450);
  };

  AdView.prototype.closeDetails = function() {
    this.detailsContainer.classList.remove('active');
    this.detailsWrapper.classList.remove('active');
  };

  function OperatorCard() {
    this.domElement = document.createElement('div');
    this.domElement.classList.add('intro');
    this.welcomeText = document.createElement('p');
    this.welcomeText.textContent = 'Welcome to Specials';
    this.domElement.appendChild(this.welcomeText);
  }

  function Ad(cardIndex) {
    var self = this;

    this.summaryElement = document.createElement('div');
    this.summaryElement.classList.add('card');
    this.summaryElement.dataset.cardIndex = cardIndex;

    this.summaryImage = document.createElement('div');
    this.summaryImage.classList.add('summaryImage');
    this.summaryContent = document.createElement('p');
    this.summaryContent.classList.add('summaryContent');

    this.summaryElement.appendChild(this.summaryImage);
    this.summaryElement.appendChild(this.summaryContent);

    this.detailElement = document.createElement('div');
    this.detailElement.classList.add('card');
    this.detailElement.dataset.cardIndex = cardIndex;

    this.image = document.createElement('img');
    this.image.classList.add('detailsImage');
    this.content = document.createElement('p');
    this.content.classList.add('content');
    this.cardDetailsContainer = document.createElement('div');
    this.cardDetailsContainer.classList.add('cardDetailsContainer');
    this.activationButton = document.createElement('div');
    this.activationButton.classList.add('activationButton');
    this.activationText = document.createElement('p');
    this.activationText.classList.add('activationText');

    this.activationButton.appendChild(this.activationText);
    this.activationButton.addEventListener('touchend', function(e) {
      e.stopPropagation();
      self.activateAd();
    });

    this.detailElement.appendChild(this.image);
    this.detailElement.appendChild(this.cardDetailsContainer);
    this.detailElement.appendChild(this.content);
    this.detailElement.appendChild(this.activationButton);
  }

  Ad.prototype.setData = function(data) {
    this.cardData = data;

    this.summaryElement.classList.add('ad');
    this.detailElement.classList.add('ad');
    if (data.type === 'telenor') {
      this.summaryElement.classList.add('telenor');
      this.detailElement.classList.add('telenor');
    }

    this.summaryImage.style.backgroundImage = 'url(' + data.image + ')';
    this.summaryContent.textContent = data.text;
    this.image.src = data.image;
    this.content.textContent = data.text;
    this.activationText.textContent = data.activationText;
    this.url = data.url;
  };

  Ad.prototype.activateAd = function() {
    var data = this.cardData;
    switch(data.action.type) {
      case 'url':
        new MozActivity({name: 'view', data: {type: 'url', url: data.action.url}});
        break;
      case 'call':
        new MozActivity({name: 'dial', data: {type: 'webtelephony/number',
            number: data.action.phoneNumber}});
        break;
    }
    var eventData = [];
    eventData.push({'advertisement': data.id, 'timestamp': new Date().toISOString()});
    var event = new CustomEvent('ad-activated', {'detail': eventData});
    document.dispatchEvent(event);
  };

  var AdUtils = exports.AdUtils = function (){};

  AdUtils.findTelenorSims = function() {
    var ICCs = navigator.mozIccManager.iccIds;
    var telenorSims = [];
    for (var i = 0; i < ICCs.length; i++) {
      var iccData = navigator.mozIccManager.getIccById(ICCs[i]);
      if (iccData && iccData.cardState === 'ready') {
        if ((iccData.iccInfo.mcc === '242' || iccData.iccInfo.mcc === '470')
            && iccData.iccInfo.mnc === '01') {
          var simData = {};
          simData.slot = i;
          simData.iccData = iccData;
          telenorSims.push(simData);
        }
      }
    }
    if (telenorSims.length > 0) {
      return telenorSims;
    } else {
      return;
    }
  };

  AdUtils.initializeSystem = function() {
    if (!AdUtils.initialized) {
      AdUtils.initialized = true;
      var adView = new AdView(window.GridManager);
      adView.createAdPage();
      var adManager = new AdManager(adView);
      adManager.setupAds();

      GridManager.goToLandingPage = function() {
        document.body.dataset.transitioning = 'true';
        // if we have ads the home button should go to page 1, not 0
        GridManager.goToPage(AdView ? 1 : 0);
      };
    }
  }

  document.addEventListener('homescreen-ready', function(e) {
    if (AdUtils.findTelenorSims()) {
      AdUtils.initializeSystem();
    } else {
      var ICCs = navigator.mozIccManager.iccIds;
      for (var i = 0; i < ICCs.length; i++) {
        navigator.mozIccManager.getIccById(ICCs[i]).oniccinfochange = function(icc) {
          if (icc.target.cardState === 'ready') {
            if (AdUtils.findTelenorSims()) {
              AdUtils.initializeSystem();
            } else {
              navigator.mozIccManager.getIccById(icc.target.iccInfo.iccid)
                .oniccinfochange = null;
            }
          }
        };
      }
    }
  }, false);

})(window);
