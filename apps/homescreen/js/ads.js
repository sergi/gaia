'use strict';

/*global GridManager MozActivity dump */
(function(exports) {

  var AdManager = exports.AdManager = function(adView) {
    this.currentAds = [];
    this.view = adView;

    this.apiPrefix = 'http://fxosad.telenordigital.com'
    this.adsUrl = this.apiPrefix + '/api/client/data';
    this.analyticsUrl = this.apiPrefix + '/api/analytics';

    document.addEventListener('ad-analytics', this.sendAnalytics.bind(this));
    document.addEventListener('fetch-ads', this.fetchAds.bind(this));
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
        .then(self.sendStoredAnalytics.bind(self), self.storeAnalytics);
    }
  };

  AdManager.prototype.sendStoredAnalytics = function() {
    var self = this;
    asyncStorage.getItem('Telenor-analytics', function(previousEvents) {
    if (previousEvents) {
      previousEvents = JSON.parse(previousEvents);
      self.sendNetworkRequest('POST', self.analyticsUrl, previousEvents)
        .then(function() {asyncStorage.removeItem('Telenor-analytics');});
      }
    });
  };

  AdManager.prototype.storeAnalytics = function(event) {
    asyncStorage.getItem('Telenor-analytics', function(previousEvents) {
      if (previousEvents) {
        previousEvents = JSON.parse(previousEvents);
        previousEvents.push(event[0]);
      } else {
        previousEvents = event;
      }
      asyncStorage.setItem('Telenor-analytics', JSON.stringify(previousEvents));
    });
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
      var req = new XMLHttpRequest({mozSystem: true, timeout: 60 * 1000});
      req.open(type, url);

      req.onload = function() {
        if (req.status == 200) {
          resolve(req.response);
        }
        else {
          reject(data);
        }
      };

      req.onerror = function() {
        reject(data);
      };

      req.ontimeout = function() {
        reject(data);
      }

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
      asyncStorage.setItem('Telenor-ads', JSON.parse(response));
      self.manageAds(JSON.parse(response));
    });
  };

  AdManager.prototype.fetchImage = function(ad) {
    /* Flow:
     * 1. Check if the image is on the device.
     * 2a. if success: return the old one.
     * 2b. if not available: download new one.
     * 2ba. if success: Store in DB and return local.
     * 2bb. if error: reject this ad.
     */
    var self = this;
    return new Promise(function(resolve, reject) {
      asyncStorage.getItem(ad.image, function(imageData) {
        if (imageData) {
          ad.imageData = imageData;
          resolve(ad);
        } else {
          self.sendNetworkRequest('GET', self.apiPrefix + ad.image + '/base64').then(
            function(response) {
              asyncStorage.setItem(ad.image, response, function() {
                ad.imageData = response;
                resolve(ad);
              });
            },
            function(error) {
              reject(Error(error));
            }
          );
        }
      });
    });
  }

  AdManager.prototype.manageAds = function(apiData) {
    var self = this;

    //Handle sponsors
    var sponsors = apiData.sponsors;
    if (this.currentSponsor) {
      var lookup = {};
      for (var i = 0, len = sponsors.length; i < len; i++) {
        lookup[sponsors[i].id] = sponsors[i];
      }
      if (!lookup[this.currentSponsor.id]) {
        this.removeDBItem(this.currentSponsor.id);
      }
    }

    // Reset the current sponsor.
    this.currentSponsor = [];

    // Make sure the ads are valid in this function.
    if (sponsors.length > 0) {
      var validSponsors = [];
      var currentDate = new Date();
      for (var i = 0; i < sponsors.length; i++) {
        // Check if the sponsor contains an image.
        if (sponsors[i].image) {
          var sponsorAvailability = sponsors[i].availability;
          // Check if the ad has a start and end date.
          if (sponsorAvailability && sponsorAvailability.start && sponsorAvailability.end) {
            var startDate = new Date(sponsorAvailability.start);
            var endDate = new Date(sponsorAvailability.end);
            // Compare the date of the ad with the current time.
            if (currentDate > startDate && currentDate < endDate) {
              validSponsors.push(sponsors[i]);
            }
          }
        }
      }

      // the ads now have valid data, try loading the images and rendering them.
      for (var i = 0; i < validSponsors.length; i++) {
        this.fetchImage(validSponsors[i]).then(function(sponsor) {
          self.currentSponsor = sponsor;
          self.view.setSponsor(self.currentSponsor);
        });
      }
    } else {
      self.view.removeSponsor();
    }


    //Handle advertisements
    var advertisements = apiData.advertisements;
    if (this.currentAds && this.currentAds.length > 0) {
      var lookup = {};
      for (var i = 0, len = advertisements.length; i < len; i++) {
        lookup[advertisements[i].id] = advertisements[i];
      }
      for (var i = 0; i < this.currentAds.length; i++) {
        if (!lookup[this.currentAds[i].id]) {
          this.removeDBItem(this.currentAds[i].id);
        }
      }
    }

    // Reset the current advertisements to avoid duplicates.
    this.currentAds = [];

    // Make sure the ads are valid in this function.
    if (advertisements.length > 0) {
      var validAds = [];
      var currentDate = new Date();
      for (var i = 0; i < advertisements.length; i++) {
        // Check if the ad contains an image.
        if (advertisements[i].image) {
          var adAvailability = advertisements[i].availability;
          // Check if the ad has a start and end date.
          if (adAvailability && adAvailability.start && adAvailability.end) {
            var startDate = new Date(adAvailability.start);
            var endDate = new Date(adAvailability.end);
            // Compare the date of the ad with the current time.
            if (currentDate > startDate && currentDate < endDate) {
              validAds.push(advertisements[i]);
            }
          }
        }
      }

      // the ads now have valid data, try loading the images and rendering them.
      for (var i = 0; i < validAds.length; i++) {
        this.fetchImage(validAds[i]).then(function(ad) {
          self.currentAds.push(ad);
          self.view.setAds(self.currentAds);
        });
      }
    } else {
      self.view.setAds([]);
    }
  };

  AdManager.prototype.setupAds = function() {
    var self = this;
    // Load all ads from the database on phone boot, if there are none, load the json file.
    asyncStorage.getItem('Telenor-ads', function(ads) {
      if (ads) {
        self.manageAds(ads)
      } else {
        self.loadFile('js/preloadedads.json', function(preloadedAds) {
            self.currentAds = preloadedAds.advertisements;
            self.view.setAds(self.currentAds);
          },
          function() {console.log('Error loading preloaded ads')});
      }
    });
    // Try fetching ads 10 seconds after device boot.
    window.setTimeout(this.fetchAds.bind(this), 10000);
    // Try fetching ads every 6 hours.
    window.setInterval(this.fetchAds.bind(this), 6 * 60 * 60 * 1000);
  };

  AdManager.prototype.removeDBItem = function(adId) {
    // Remove the images from an old ad from the DB.
    var lookup = {};
    for (var i = 0, len = this.currentAds.length; i < len; i++) {
      lookup[this.currentAds[i].id] = this.currentAds[i];
    }
    lookup[this.currentSponsor.id] = this.currentSponsor;

    if (lookup[adId].image) {
      asyncStorage.getItem(lookup[adId].image, function(image) {
        if (image) {
          asyncStorage.removeItem(lookup[adId].image);
        };
      });
    }
  };

  var AdView = exports.AdView =  function(gridManager) {
    this.summaryContainer = document.createElement('div');
    this.summaryContainer.id = 'summaryContainer';
    this.sponsorBanner = document.createElement('div');
    this.sponsorBanner.id = 'sponsorBanner';
    this.detailsContainer = document.createElement('div');
    this.detailsContainer.id = 'detailsContainer';

    this.sponsorBanner.addEventListener('touchend', function() {
      if (this.sponsorUrl) {
        new MozActivity({name: 'view', data: {type: 'url', url: self.sponsorUrl}});
      }
    })

    this.cardsList = [];
    this.dataStore = null;
    this.detailsVisible = false;
    this.deviceId = null;
    this.gridManager = gridManager;

    document.addEventListener('close-details', this.closeDetails.bind(this));
    window.setInterval(this.flipCards, 2000);
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
    this.domElement = this.gridManager.container.firstChild;
    this.domElement.classList.add('ad-page');

    var startEvent, currentX, currentY, startX, startY, dx, dy,
        detecting = false, swiping = false, scrolling = false

    this.domElement.addEventListener('gridpageshowend', function(e) {
        document.querySelector('#footer').style.transform = 'translateY(100%)';
    });
    this.domElement.addEventListener('gridpagehideend', function(e) {
        document.querySelector('#footer').style.transform = '';
    });

    this.domElement.addEventListener('touchstart', function(e) {
      startEvent = e;
      swiping = false;
      detecting = true;
      startX = startEvent.touches[0].pageX;
      startY = startEvent.touches[0].pageY;
    });
    this.domElement.addEventListener('touchmove', function(e) {
      if (self.detailsVisible) {
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
        }
      }
    });
    this.domElement.addEventListener('touchend', function(e) {
      if (swiping === false && scrolling === false) {
        if (self.detailsVisible === false) {
          var card = e.target.dataset.cardIndex;
          if (card) {
            self.openDetails(card);
          }
        }
      }
      detecting = scrolling = false;
    });

    this.createCards();

    this.domElement.appendChild(this.sponsorBanner);
    this.domElement.appendChild(this.summaryContainer);
    this.domElement.appendChild(this.detailsContainer);

    return this.domElement;
  };

  AdView.prototype.createCards = function() {
    this.operatorCard = new OperatorCard();
    this.summaryContainer.appendChild(this.operatorCard.domElement);
    this.detailedCard = new DetailedCard();
    this.detailsContainer.appendChild(this.detailedCard.domElement);
  };

  AdView.prototype.flipCards = function() {
    var flippableOffers = document.querySelectorAll('#summaryContainer .offer .summaryImage');
    for(var i = 0; i < flippableOffers.length; i++) {
      flippableOffers[i].classList.toggle('flipped');
    };
  };

  AdView.prototype.setAds = function(adsData) {
    var ads = adsData;
    var currentCards = document.querySelectorAll('#summaryContainer > .card');
    var cardCount = currentCards.length;
    for (var i = ads.length; i < cardCount; i++) {
      // Remove some excess cards.
      var card = this.cardsList.pop();
      card.ad.summaryElement.parentNode.removeChild(card.ad.summaryElement);
    }
    for (var i = cardCount; i < ads.length; i++) {
      // Add some extra cards.
      var card = {};
      card.ad = new Ad(i);
      this.cardsList.push(card);
      this.summaryContainer.appendChild(card.ad.summaryElement);
    }

    for (var i = 0; i < ads.length; i++) {
      this.cardsList[i].ad.setData(ads[i]);
    }
  };

  AdView.prototype.setSponsor = function(sponsor) {
    this.domElement.classList.add('sponsored');
    this.sponsorBanner.style.backgroundImage = 'url(' + sponsor.imageData + ')';
    this.sponsorUrl = sponsor.url;
  }

  AdView.prototype.removeSponsor = function() {
    this.domElement.classList.remove('sponsored');
  }

  AdView.prototype.openDetails = function(card) {
    this.currentCard = card-0;
    var currentCardData = this.cardsList[this.currentCard].ad.cardData;
    this.detailedCard.setData(currentCardData);

    LazyLoader.load('shared/style/buttons.css');

    this.detailsContainer.classList.add('active');
    this.detailsVisible = true;

    var eventData = [];
    var card = {};
    card.id = currentCardData.id
    eventData.push({'card': card, 'timestamp': new Date().toISOString(), type: 'view'});
    var event = new CustomEvent('ad-analytics', {'detail': eventData});
    document.dispatchEvent(event);
  };

  AdView.prototype.closeDetails = function() {
    this.detailsVisible = false;
    this.detailsContainer.classList.remove('active');
  };

  var DetailedCard = function() {
    var self = this;

    this.domElement = document.createElement('div');

    this.closeButton = document.createElement('div');
    this.closeButton.classList.add('closeButton');
    var closeText = document.createElement('p');
    closeText.textContent = 'X';
    this.closeButton.appendChild(closeText);
    this.image = document.createElement('img');
    this.image.classList.add('detailsImage');
    this.content = document.createElement('p');
    this.content.classList.add('content');
    this.cardDetails = document.createElement('p');
    this.cardDetails.classList.add('cardDetails');
    this.activationButton = document.createElement('button');
    this.activationButton.classList.add('activationButton');
    this.activationButton.classList.add('recommend');
    this.buttonText = document.createElement('p');
    this.buttonText.classList.add('buttonText');

    this.closeButton.addEventListener('touchend', function(e) {
      var event = new Event('close-details');
      document.dispatchEvent(event);
    });

    this.activationButton.appendChild(this.buttonText);
    this.activationButton.addEventListener('touchend', function(e) {
      e.stopPropagation();
      self.activate();
    });

    this.domElement.appendChild(this.closeButton);
    this.domElement.appendChild(this.image);
    this.domElement.appendChild(this.cardDetails);
    this.domElement.appendChild(this.content);
    this.domElement.appendChild(this.activationButton);
  };

  DetailedCard.prototype.activate = function() {
    var data = this.cardData;
    switch(data.action.type) {
      case 'url':
        new MozActivity({name: 'view', data: {type: 'url', url: data.action.url}});
        break;
      case 'call':
        new MozActivity({name: 'dial', data: {type: 'webtelephony/number',
            number: data.action.phoneNumber}});
        break;
      case 'sms':
        new MozActivity({name: 'new', data: {type: 'websms/sms',
            number: data.action.phoneNumber, body: data.action.smsMessage}});
        break;
    }
    var eventData = [];
    var card = {};
    card.id = data.id
    eventData.push({'card': card, 'timestamp': new Date().toISOString(), type: 'click'});
    var event = new CustomEvent('ad-analytics', {'detail': eventData});
    document.dispatchEvent(event);
  };

  DetailedCard.prototype.setData = function(data) {
    this.cardData = data;

    this.domElement.className = '';
    this.domElement.classList.add('card');
    this.domElement.classList.add(data.type);

    this.image.src = data.imageData;
    this.content.textContent = data.descriptionText;
    this.buttonText.textContent = data.buttonText;
    this.action = data.action;
    this.cardDetails.textContent = data.provider;
  }

  var OperatorCard = function() {
    var self = this;
    this.domElement = document.createElement('div');
    this.domElement.classList.add('intro');

    if (navigator.mozSettings) {
      var hasRefreshLock = navigator.mozSettings.createLock();
      var hasRefresh = hasRefreshLock.get('adsRefreshButton.enabled');
        hasRefresh.onsuccess = (function() {
          if (hasRefresh.result['adsRefreshButton.enabled']) { 
            self.fetchIcon = document.createElement('p');
            self.fetchIcon.classList.add('fetchIcon');
            self.fetchIcon.textContent = '↻';
            self.fetchIcon.addEventListener('touchend', function() {
              var event = new Event('fetch-ads');
              document.dispatchEvent(event);
            });
          self.domElement.appendChild(self.fetchIcon);
        }
      });
    }
  }

  function Ad(cardIndex) {
    var self = this;

    this.summaryElement = document.createElement('div');
    this.summaryElement.classList.add('card');
    this.summaryElement.dataset.cardIndex = cardIndex;

    this.summaryImage = document.createElement('div');
    this.summaryImage.classList.add('summaryImage');
    var summaryInfo = document.createElement('div');
    summaryInfo.classList.add('summaryInfo');
    this.summaryContent = document.createElement('p');
    this.summaryContent.classList.add('summaryContent');
    this.summaryProvider = document.createElement('p');
    this.summaryProvider.classList.add('summaryProvider');

    this.summaryElement.appendChild(this.summaryImage);
    summaryInfo.appendChild(this.summaryContent);
    summaryInfo.appendChild(this.summaryProvider);
    this.summaryElement.appendChild(summaryInfo);
  }

  Ad.prototype.setData = function(data) {
    this.cardData = data;

    this.summaryElement.className = '';
    this.summaryElement.classList.add('card');
    this.summaryElement.classList.add(data.type);

    while (this.summaryImage.firstChild) {
      this.summaryImage.removeChild(this.summaryImage.firstChild);
    }

    if (data.type === 'offer') {
      var firstImage = document.createElement('div');
      firstImage.classList.add('firstImage');
      var secondImage = document.createElement('div');
      secondImage.classList.add('secondImage');

      firstImage.style.backgroundImage = 'url(' + data.imageData + ')';
      secondImage.style.backgroundImage = 'url(' + data.imageData + ')';

      this.summaryImage.style.backgroundImage = '';
      this.summaryImage.appendChild(firstImage);
      this.summaryImage.appendChild(secondImage);
    } else {
      this.summaryImage.style.backgroundImage = 'url(' + data.imageData + ')';
    }

    this.summaryContent.textContent = data.descriptionText;
    this.summaryProvider.textContent = data.provider;
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
