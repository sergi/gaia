'use strict';

/*global GridManager MozActivity dump */
(function(exports) {

  var AdManager = exports.AdManager = function(adView, telenorSims) {
    this.currentAds = [];
    this.view = adView;
    this.telenorSims = telenorSims;

    this.setApiPrefix('https://fxosad.telenordigital.com');

    this.forceCellNetworkForAuthorize = true;
    this.pendingAuthTokenRequest = false;
    this.pendingNetworkRequests = {};

    navigator.mozSetMessageHandler('alarm', this.handleAlarm.bind(this));

    document.addEventListener('ad-analytics', this.sendAnalytics.bind(this));
    document.addEventListener('fetch-all', this.fetchAll.bind(this));
    document.addEventListener('offer-redemption', this.redeemOffer.bind(this));
    document.addEventListener('online', this.fetchAll.bind(this));
  };

  AdManager.prototype.setApiPrefix = function(apiPrefix) {
    this.apiPrefix = apiPrefix;
    this.adsUrl = this.apiPrefix + '/api/client/data';
    this.analyticsUrl = this.apiPrefix + '/api/client/events';
    this.pointsUrl = this.apiPrefix + '/api/client/points';
    this.identifyUrl = this.apiPrefix + '/api/client/auth/identify';
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

  AdManager.prototype.handleAlarm = function (alarm) {
    console.log('Handling alarm');
    var currentData = {};
    currentData.sponsors = [];
    currentData.sponsors.push(this.currentSponsor);
    currentData.advertisements = this.currentAds;
    this.manageAds(currentData);
  }

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
  };

  AdManager.prototype.sendNetworkRequest = function(type, url, data) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var req = new XMLHttpRequest({mozSystem: true, timeout: 60 * 1000});
      req.open(type, url);
      if (self.authToken) {
        req.setRequestHeader('Authorization', self.authToken);
      }

      req.onload = function() {
        if (req.status === 200) {
          resolve(req.response);
        } if (req.status === 401) {
          self.authToken = null;

          // if we're not already fetching the token, do so
          if (!self.pendingAuthTokenRequest) {
            self.pendingAuthTokenRequest = true;
            var tokenSettings = {
              sims: self.telenorSims,
              url: self.identifyUrl,
              forceCellNetworkForAuthorize: self.forceCellNetworkForAuthorize
            };
            getAdToken(tokenSettings, function(err, token) {
              if (err || !token) {
                console.error('Error fetching access token: ' + JSON.stringify(err));

                // if we didn't manage to get a token, error out all pending requests
                for (var requestId in self.pendingNetworkRequests) {
                  var requests = self.pendingNetworkRequests[requestId];
                  requests.forEach(function(request) {
                    request.error(request.data);
                  });
                }
              } else {
                self.authToken = token;

                // if we managed to get a token, send off all of the requests and call the right callbacks
                for (var requestId in self.pendingNetworkRequests) {
                  var requests = self.pendingNetworkRequests[requestId];
                  requests.forEach(function(request) {
                    // FIXME: maybe blindly recursing isn't that smart...perhaps we need a max retry count or something?
                    self.sendNetworkRequest(request.type, request.url, request.data).then(request.success, request.error);
                  });
                }
              }

              self.pendingAuthTokenRequest = false;
              self.pendingNetworkRequests = {};
            });
          }

          // queue up our request so that it will be retried once we have a auth token
          var requestIdentifier = type + ':' + url;
          self.pendingNetworkRequests[requestIdentifier] = self.pendingNetworkRequests[requestIdentifier] || [];
          if (!(type === 'GET' && self.pendingNetworkRequests[requestIdentifier].length)) {
            console.log('Request to ' + url + '(' + type + ') queued for trying after auth token is fetched');
            self.pendingNetworkRequests[requestIdentifier].push({ type: type, url: url, data: data, success: resolve, error: reject });
          } else {
            reject(data);
          }
        } else {
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
  };

  AdManager.prototype.sendOfferClaimRequest = function(url) {
    this.sendNetworkRequest('POST', this.apiPrefix + url)
      .then(function(response) {
        var notificationContent = {};
        if (response.offerSuccessText) {
          notificationContent.body = response.offerSuccessText;
        } else {
          notificationContent.body = 'You have successfully activated an offer.';
        }
        var redeemNotification = new Notification('GP', {
          body: notificationContent.body
        });
        redeemNotification.close();
        var event = new Event('fetch-all');
        document.dispatchEvent(event);
      }, function(error) {
        console.error('Error activating offer: ' + JSON.stringify(error));
      });
  };

  AdManager.prototype.redeemOffer = function(event) {
    var self = this;
    var action = event.detail.action;
    switch (action.type) {
      case 'url':
        new MozActivity({name: 'view', data: {type: 'url', url: action.url}});
        self.sendOfferClaimRequest(action.activationUrl);
        break;
      case 'sms':
        if (navigator.mozMobileMessage) {
          var offerSMS = navigator.mozMobileMessage.send(action.phoneNumber, action.smsMessage);
          offerSMS.onsuccess = function() {
            self.sendOfferClaimRequest(action.activationUrl);
          };
        };
        break;
      case 'provision':
        self.sendOfferClaimRequest(action.activationUrl);
        break;
      default:
        // Do not try to activate this offer.
        return;
    }
  };

  AdManager.prototype.fetchAll = function() {
    console.log('Fetching ads and points');
    this.fetchAds();
    this.fetchPoints();
  };

  AdManager.prototype.fetchAds = function(isRetryRequest) {

    var self = this;
    this.sendNetworkRequest('GET', this.adsUrl).then(function (response) {
      self.adsInitialized = true;
      self.pollingForAds = false;

      asyncStorage.setItem('Telenor-ads', JSON.parse(response));
      self.manageAds(JSON.parse(response));

      if (!self.fetchAdsInterval) {
        // Try fetching ads every 6 hours.
        self.fetchAdsInterval = window.setInterval(self.fetchAds.bind(self), 6 * 60 * 60 * 1000);
      }
    }, function(error) {
      console.error('Error fetching ads: ' + JSON.stringify(error));

      // if we've already successfully fetched ads before, this is just a
      // "normal" error, so we can bail out. If we're already doing the retry
      // polling and this isn't a retry request, there's no point in polling again, 
      // so bail out.
      if (self.adsInitialized || (self.pollingForAds && !isRetryRequest)) {
        console.log('Received an error fetching ads, but not starting polling');
        return;
      }

      if (!isRetryRequest) {
        console.log('Received an error fetching ads, starting polling');
      }

      self.pollingForAds = true;

      // otherwise, start to periodically try to fetch the ads using an
      // exponential backoff
      self.adsFetchExponent = Math.min(7, self.adsFetchExponent || 0);
      window.setTimeout(function() {
        self.fetchAds(true);
      }, (1000 * 60) << self.adsFetchExponent++);
    });
  };

  AdManager.prototype.fetchPoints = function(isRetryRequest) {
    var self = this;
    this.sendNetworkRequest('GET', this.pointsUrl).then(function (response) {
      self.pointsInitialized = true;
      self.pollingForPoints = false;

      asyncStorage.setItem('Telenor-points', JSON.parse(response));
      self.managePoints(JSON.parse(response));

      if (!self.fetchPointsInterval) {
        // Try fetching points every 8 hours.
        self.fetchPointsInterval = window.setInterval(self.fetchPoints.bind(self), 8 * 60 * 60 * 1000);
      }
    }, function(error) {
      console.error('Error fetching points: ' + JSON.stringify(error));

      // if we've already successfully fetched points before, this is just a
      // "normal" error, so we can bail out. If we're already doing the retry
      // polling and this isn't a retry request, there's no point in polling again, 
      // so bail out.
      if (self.pointsInitialized || (self.pollingForPoints && !isRetryRequest)) {
        console.log('Received an error fetching points, but not starting polling');
        return;
      }

      if (!isRetryRequest) {
        console.log('Received an error fetching points, starting polling');
      }

      self.pollingForPoints = true;

      // otherwise, start to periodically try to fetch the points using an
      // exponential backoff
      self.pointsFetchExponent = Math.min(7, self.pointsFetchExponent || 0);
      window.setTimeout(function() {
        self.fetchPoints(true);
      }, (1000 * 60) << self.pointsFetchExponent++);
    });
  };

  AdManager.prototype.fetchImage = function(imageUrl) {
    /* Flow:
     * 1. Check if the image is on the device.
     * 2a. if success: return the old one.
     * 2b. if not available: download new one.
     * 2ba. if success: Store in DB and return local.
     * 2bb. if error: reject this ad.
     */
    var self = this;
    return new Promise(function(resolve, reject) {
      asyncStorage.getItem(imageUrl, function(imageData) {
        if (imageData) {
          resolve(imageData);
        } else {
          self.sendNetworkRequest('GET', self.apiPrefix + imageUrl + '/base64').then(
            function(response) {
              asyncStorage.setItem(imageUrl, response, function() {
                resolve(response);
              });
            },
            function(error) {
              reject(Error(error));
            }
          );
        }
      });
    });
  };

  AdManager.prototype.manageAds = function(apiData) {
    if (!apiData) {
      return;
    }

    var self = this;

    var alarms = navigator.mozAlarms.getAll();
    alarms.onsuccess = function(event) {
      if (!event.target.result || event.target.result.length === 0) {
        var alarmTime = new Date();
        alarmTime.setHours(24, 0, 1, 0);
        navigator.mozAlarms.add(alarmTime, 'ignoreTimezone', {});
      }
    }

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

    // Make sure the sponsors are valid in this function.
    if (sponsors.length > 0) {
      var validSponsors = [];
      var currentDate = new Date();
      for (var i = 0; i < sponsors.length; i++) {
        // Check if the sponsor contains an image.
        if (sponsors[i].images || sponsors[i].imagesData) {
          var sponsorAvailability = sponsors[i].availability;
          // Check if the sponsor has a start and end date.
          if (sponsorAvailability && sponsorAvailability.start && sponsorAvailability.end) {
            var startDate = new Date(sponsorAvailability.start);
            var endDate = new Date(sponsorAvailability.end);
            // Compare the date of the sponsor with the current time.
            if (currentDate > startDate && currentDate < endDate) {
              validSponsors.push(sponsors[i]);
            }
          }
        }
      }

      // the sponsors now have valid data, try loading the images and rendering them.
      validSponsors.forEach(function(currentSponsor) {
        if (currentSponsor.imagesData) {
          self.currentSponsor = currentSponsor;
          self.view.setSponsor(self.currentSponsor);
        } else {
          self.fetchImage(currentSponsor.images[0]).then(function(image) {
            currentSponsor.imagesData = image;
            self.currentSponsor = currentSponsor;
            self.view.setSponsor(self.currentSponsor);
          });
        }
      });
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
        if (advertisements[i].images || advertisements[i].imagesData) {
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
      validAds.forEach(function(currentAd) {
        if (currentAd.imagesData) {
          self.currentAds.push(currentAd);
          self.view.setAds(self.currentAds);
        } else {
          var imagePromises = [];
          currentAd.images.forEach(function(image) {
            imagePromises.push(self.fetchImage(image));
          });

          Promise.all(imagePromises).then(function (results) {
            currentAd.imagesData = results;
            self.currentAds.push(currentAd);
            self.view.setAds(self.currentAds);
          });
        }
      });
    } else {
      self.view.setAds([]);
    }
  };

  AdManager.prototype.managePoints = function(apiData) {
    this.view.setPoints(apiData);
  }

  AdManager.prototype.setupSystem = function() {
    var self = this;
    // Load all ads from the database on phone boot, if there are none, load the json file.
    asyncStorage.getItem('Telenor-ads', function(ads) {
      if (ads) {
        self.manageAds(ads)
      } else {
        self.loadFile('js/preloadedads.json', function(preloadedAds) {
            self.manageAds(preloadedAds)
          },
          function() {console.log('Error loading preloaded ads')});
      }
    });

    asyncStorage.getItem('Telenor-points', function(points) {
      if (points) {
        self.managePoints(points)
      }
    });

    if (navigator.mozSettings) {
      var serverUrlLock = navigator.mozSettings.createLock();
      var serverUrl = serverUrlLock.get('ads.serverUrl');
      serverUrl.onsuccess = function() {
        var url = serverUrl.result['ads.serverUrl'];
        if (url) {
          self.setApiPrefix(url);
        }
        var forceCellNetworkLock = navigator.mozSettings.createLock();
        var forceCellNetwork = forceCellNetworkLock.get('ads.forceCellNetwork.disabled');
        forceCellNetwork.onsuccess = function() {
          if (forceCellNetwork.result['ads.forceCellNetwork.disabled']) {
            self.forceCellNetworkForAuthorize = false;
          }
          self.fetchAll();
        };
      };
    }
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
    var self = this;
    this.summaryContainer = document.createElement('div');
    this.summaryContainer.id = 'summaryContainer';
    this.sponsorBanner = document.createElement('div');
    this.sponsorBanner.id = 'sponsorBanner';
    this.detailsContainer = document.createElement('div');
    this.detailsContainer.id = 'detailsContainer';

    this.sponsorBanner.addEventListener('touchend', function() {
      if (self.sponsorData) {
        var eventData = [];
        var sponsor = {};
        sponsor.id = self.sponsorData.id
        eventData.push({'sponsor': sponsor, 'timestamp': new Date().toISOString(), type: 'click'});
        var event = new CustomEvent('ad-analytics', {'detail': eventData});
        document.dispatchEvent(event);

        new MozActivity({name: 'view', data: {type: 'url', url: self.sponsorData.url}});
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
    this.domElement.addEventListener('contextmenu', function(e) {
      e.stopPropagation();
    });

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
    var flippableOffers = document.querySelectorAll('#summaryContainer .offer .summaryImage.flippable');
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

  AdView.prototype.setPoints = function(pointsData) {
    this.operatorCard.setPoints(pointsData.points);
  }

  AdView.prototype.setSponsor = function(sponsor) {
    this.domElement.classList.add('sponsored');
    this.sponsorBanner.style.backgroundImage = 'url(' + sponsor.imagesData + ')';
    this.sponsorData = sponsor;
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

    this.activationButton.appendChild(this.buttonText);
    this.activationButton.addEventListener('touchend', function(e) {
      e.stopPropagation();
      self.activate();
    });

    this.redeemContainer = document.createElement('div');
    this.redeemContainer.classList.add('redeemContainer');
    this.redeemConfirmText = document.createElement('div');
    this.redeemConfirmText.classList.add('redeemConfirmText');
    var redeemButtonsContainer = document.createElement('menu');
    redeemButtonsContainer.classList.add('redeemButtonsContainer');
    this.cancelRedeemButton = document.createElement('button');
    this.cancelRedeemButton.textContent = 'Cancel';
    this.acceptRedeemButton = document.createElement('button');
    this.acceptRedeemButton.classList.add('recommend');
    this.acceptRedeemButton.textContent = 'Confirm';

    redeemButtonsContainer.appendChild(this.cancelRedeemButton);
    redeemButtonsContainer.appendChild(this.acceptRedeemButton);
    this.redeemContainer.appendChild(this.redeemConfirmText);
    this.redeemContainer.appendChild(redeemButtonsContainer);

    this.cancelRedeemButton.addEventListener('touchend', function(e) {
      self.redeemContainer.style.visibility = 'hidden';
    });
    this.acceptRedeemButton.addEventListener('touchend', function(e) {
      self.redeem();
    });

    this.closeButton.addEventListener('touchend', function(e) {
      var event = new Event('close-details');
      document.dispatchEvent(event);
    });

    this.domElement.appendChild(this.closeButton);
    this.domElement.appendChild(this.image);
    this.domElement.appendChild(this.cardDetails);
    this.domElement.appendChild(this.content);
    this.domElement.appendChild(this.activationButton);
    this.domElement.appendChild(this.redeemContainer);
  };

  DetailedCard.prototype.activate = function() {
    var data = this.cardData;
    if (data.type !== 'offer') {
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
      this.sendClickAnalytics();
    } else {
      this.redeemContainer.style.visibility = 'visible';
    }
  };

  DetailedCard.prototype.redeem = function() {
    this.sendClickAnalytics();
    this.redeemContainer.style.visibility = 'hidden';
    var event = new CustomEvent('offer-redemption', { detail: { action: this.cardData.action }});
    document.dispatchEvent(event);
  }

  DetailedCard.prototype.sendClickAnalytics = function() {
    var data = this.cardData;
    var eventData = [];
    var card = {};
    card.id = data.id
    eventData.push({'card': card, 'timestamp': new Date().toISOString(), type: 'click'});
    var event = new CustomEvent('ad-analytics', {'detail': eventData});
    document.dispatchEvent(event);
  }

  DetailedCard.prototype.setData = function(data) {
    this.cardData = data;

    this.domElement.className = '';
    this.domElement.classList.add('card');
    this.domElement.classList.add(data.type);

    this.image.src = data.imagesData[0];
    this.content.textContent = data.descriptionText;
    this.buttonText.textContent = data.buttonText;
    this.action = data.action;
    if (this.action) {
      this.activationButton.style.visibility = 'visible';
    } else {
      this.activationButton.style.visibility = 'hidden';
    }
    this.cardDetails.textContent = data.provider;
    if (data.offerConfirmationText) {
      this.redeemConfirmText.textContent = data.offerConfirmationText;
    } else {
      this.redeemConfirmText.textContent
        = 'Click Confirm to activate this offer. You will receive an SMS reply upon activation';
    }
    this.redeemContainer.style.visibility = 'hidden';
  }

  var OperatorCard = function() {
    var self = this;
    this.domElement = document.createElement('div');
    this.domElement.classList.add('intro');

    this.pointsElement = document.createElement('p');
    this.pointsElement.classList.add('points');
    this.pointsElement.textContent = '0';

    this.infoElement = document.createElement('img');
    this.infoElement.classList.add('info');
    this.infoElement.src = 'style/images/grameenphoneHotboxInfo.png';
    this.infoElement.addEventListener('touchstart', function() {
      self.infoElement.classList.add('clicked');
    });
    this.infoElement.addEventListener('touchend', function() {
      self.infoElement.classList.remove('clicked');
   
      var eventData = [];
      eventData.push({'timestamp': new Date().toISOString(), type: 'info'});
      var event = new CustomEvent('ad-analytics', {'detail': eventData});
      document.dispatchEvent(event);

      new MozActivity({name: 'view', data: {type: 'url', url: 'http://www.grameenphone.com'}});
    });

    if (navigator.mozSettings) {
      var hasRefreshLock = navigator.mozSettings.createLock();
      var hasRefresh = hasRefreshLock.get('ads.refreshButton.enabled');
        hasRefresh.onsuccess = (function() {
          if (hasRefresh.result['ads.refreshButton.enabled']) { 
            self.fetchIcon = document.createElement('p');
            self.fetchIcon.classList.add('fetchIcon');
            self.fetchIcon.textContent = '↻';
            self.fetchIcon.addEventListener('touchend', function() {
              var event = new Event('fetch-all');
              document.dispatchEvent(event);
            });
          self.domElement.appendChild(self.fetchIcon);
        }
      });
    }
    this.domElement.appendChild(this.pointsElement);
    this.domElement.appendChild(this.infoElement);
  }

  OperatorCard.prototype.setPoints = function(points) {
    this.pointsElement.textContent = points;
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
      firstImage.style.backgroundImage = 'url(' + data.imagesData[0] + ')';

      this.summaryImage.style.backgroundImage = '';
      this.summaryImage.appendChild(firstImage);

      if (data.imagesData[1]) {
        var secondImage = document.createElement('div');
        secondImage.classList.add('secondImage');
        secondImage.style.backgroundImage = 'url(' + data.imagesData[1] + ')';
        this.summaryImage.appendChild(secondImage);
        this.summaryElement.classList.add('flippable');
      }
    } else {
      this.summaryImage.style.backgroundImage = 'url(' + data.imagesData[0] + ')';
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

  AdUtils.initializeSystem = function(telenorSims) {
    if (!AdUtils.initialized) {
      AdUtils.initialized = true;

      var adView = new AdView(window.GridManager);
      adView.createAdPage();
      var adManager = new AdManager(adView, telenorSims);
      adManager.setupSystem();

      GridManager.goToLandingPage = function() {
        document.body.dataset.transitioning = 'true';
        // if we have ads the home button should go to page 1, not 0
        GridManager.goToPage(AdView ? 1 : 0);
      };
    }
  }

  document.addEventListener('homescreen-ready', function(e) {
    var telenorSims = AdUtils.findTelenorSims();
    if (telenorSims) {
      AdUtils.initializeSystem(telenorSims);
    } else {
      var ICCs = navigator.mozIccManager.iccIds;
      for (var i = 0; i < ICCs.length; i++) {
        navigator.mozIccManager.getIccById(ICCs[i]).oniccinfochange = function(icc) {
          if (icc.target.cardState === 'ready') {
            telenorSims = AdUtils.findTelenorSims();
            if (telenorSims) {
              AdUtils.initializeSystem(telenorSims);
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
