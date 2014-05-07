'use strict';

/*global GridManager MozActivity dump */
(function(exports) {

  var AdData = [{
    activationText: 'এই একটি বিজ্ঞাপন হয়',
    id: 'Ad-1',
    images: {
      summary: 'style/images/20140411_firefox_assets_010_promo-card-image_SCALED-DOWN.png',
      details: 'style/images/20140411_firefox_assets_002_promo-card-image.png'
    },
    text: 'আমরা শীঘ্রই আপনাকে দেখতে আশা করি!',
    type: 'ad',
    url: 'http://www.google.com/search?q=test'
  },{
    activationText: 'এই একটি বিজ্ঞাপন হয়',
    id: 'Ad-2',
    images: {
      summary: 'style/images/banner-publish-125x104.jpg',
      details: 'style/images/banner-publish-300x250.jpg'
    },
    text: 'আমরা শীঘ্রই আপনাকে দেখতে আশা করি!',
    type: 'ad',
    url: 'http://www.google.com/search?q=publish'
  },{
    activationText: 'এই একটি বিজ্ঞাপন হয়',
    id: 'Ad-3',
    images: {
      summary: 'style/images/Coffeys-Coffee-125x104.jpg',
      details: 'style/images/Coffeys-Coffee-300x250.jpg'
    },
    text: 'এখন আমাদের দেখার জন্য দয়া করে!',
    type: 'ad',
    url: 'http://www.google.com/search?q=coffee'
  },{
    activationText: 'এই একটি বিজ্ঞাপন হয়',
    id: 'Ad-4',
    images: {
      summary: 'style/images/kfc-125x104.jpg',
      details: 'style/images/kfc-300x250.jpg'
    },
    text: 'আমরা শীঘ্রই আপনাকে দেখতে আশা করি!',
    type: 'ad',
    url: 'http://www.kfc.com'
  },{
    activationText: 'এই একটি বিজ্ঞাপন হয়',
    id: 'Ad-5',
    images: {
      summary: 'style/images/landflip_125x104.png',
      details: 'style/images/landflip_300x250.png'
    },
    text: 'এটি একটি সীমিত সময়ের অফার হয়',
    type: 'ad',
    url: 'http://www.google.com/search?q=landflip'
  },{
    activationText: 'এই একটি বিজ্ঞাপন হয়',
    id: 'Ad-6',
    images: {
      summary: 'style/images/VW_TouaregBoeing_125x104.jpg',
      details: 'style/images/VW_TouaregBoeing_300x250.jpg'
    },
    text: 'এখন আমাদের দেখার জন্য দয়া করে!',
    type: 'ad',
    url: 'http://www.volkswagen.com'
  },{
    activationText: 'এই একটি বিজ্ঞাপন হয়',
    id: 'Ad-7',
    images: {
      summary: 'style/images/wiggle-banner-125x104.jpg',
      details: 'style/images/wiggle-banner-300x250.jpg'
    },
    text: 'এটি একটি সীমিত সময়ের অফার হয়',
    type: 'ad',
    url: 'http://www.wiggle.co.uk'
  }];

  var OfferData = {
    activationText: 'এটি একটি বিশেষ বিজ্ঞাপন হয়',
    id: 'Offer',
    images: {
      summary: 'style/images/20140411_firefox_assets_011_promo-card-grameenphone-image_SCALED-DOWN.png',
      details: 'style/images/20140411_firefox_assets_003_promo-card-grameenphone-image.png'
    },
    text: 'এখন সক্রিয় করুন!',
    type: 'telenor',
    url: 'http://www.grameenphone.com'
  };

  var ScrollDirection = {
    BACKWARD: 0,
    FORWARD: 1
  };

  var AdManager = exports.AdManager = function(adView) {
    this.currentAds = [];
    this.view = adView;
  };

  AdManager.prototype.sendAnalytics = function() {
  
  };

  AdManager.prototype.fetchAds = function() {
  
  };

  AdManager.prototype.manageAds = function(ads) {
    // Make sure the ads are valid at this point.
    this.currentAds = ads;
    this.view.setAds(this.currentAds);
  };

  AdManager.prototype.setupAds = function() {
    // Load all ads from the database on phone boot.
    var currentAds = [];
    for (var i = 0; i < 50; i++) {
      if (i % 5 !== 0) {
        var randomNumber = Math.floor(Math.random() * (7));
        currentAds[i] = AdData[randomNumber];
      } else {
        currentAds[i] = OfferData;
      }
    }
    this.manageAds(currentAds);
  };

  AdManager.prototype.removeAd = function(adId) {
  
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
        if (card >= 0 && card < 50) {
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

  AdView.prototype.setAds = function(ads) {
    var currentCards = document.querySelectorAll('#summaryContainer > .card');
    var cardCount = currentCards.length;
    for (var i = ads.length; i < cardCount; i++) {
      // Remove some excess cards.
      var card = this.cardsList.pop();
      card.ad.domElement.parentNode.removeChild(card.ad.domElement);
      card.detailedAd.domElement.parentNode.removeChild(card.detailedAd.domElement);
    }
    for (var i = cardCount; i < ads.length; i++) {
      // Add some extra cards.
      var card = {};
      card.ad = new Ad(i);
      card.detailedAd = new DetailedAd(i);
      this.cardsList.push(card);
      this.summaryContainer.appendChild(card.ad.domElement);
      this.detailsWrapper.appendChild(card.detailedAd.domElement);
    }

    for (var i = 0; i < ads.length; i++) {
      this.cardsList[i].ad.setData(ads[i]);
      this.cardsList[i].detailedAd.setData(ads[i]);
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

  function Card() {
    this.domElement = document.createElement('div');
    this.domElement.classList.add('card');
  }

  function OperatorCard() {
    this.domElement = document.createElement('div');
    this.domElement.classList.add('intro');
    this.welcomeText = document.createElement('p');
    this.welcomeText.textContent = 'Welcome to Specials';
    this.domElement.appendChild(this.welcomeText);
  }

  function Ad(cardIndex) {
    Card.call(this);

    this.domElement.dataset.cardIndex = cardIndex;

    this.summaryImage = document.createElement('div');
    this.summaryImage.classList.add('summaryImage');
    this.summaryContent = document.createElement('p');
    this.summaryContent.classList.add('summaryContent');

    this.domElement.appendChild(this.summaryImage);
    this.domElement.appendChild(this.summaryContent);
  }

  Ad.prototype.constructor = Ad;

  Ad.prototype.setData = function(data) {
    this.domElement.classList.add('ad');
    if (data.type === 'telenor') {
      this.domElement.classList.add('telenor');
    }
    this.summaryImage.style.backgroundImage = 'url(' + data.images.summary + ')';
    this.summaryContent.textContent = data.text;
  };

  function DetailedAd(cardIndex) {
    Card.call(this);
    var self = this;

    this.domElement.dataset.cardIndex = cardIndex;
    
    this.image = document.createElement('img');
    this.image.classList.add('image');
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

    this.domElement.appendChild(this.image);
    this.domElement.appendChild(this.cardDetailsContainer);
    this.domElement.appendChild(this.content);
    this.domElement.appendChild(this.activationButton);
  }

  DetailedAd.prototype.constructor = DetailedAd;

  DetailedAd.prototype.setData = function(data) {
    this.domElement.classList.add('ad');
    if (data.type === 'telenor') {
      this.domElement.classList.add('telenor');
    }
    this.image.src = data.images.details;
    this.content.textContent = data.text;
    this.activationText.textContent = data.activationText;
    this.url = data.url;
  };

  DetailedAd.prototype.activateAd = function() {
    console.log('ad activated');
    new MozActivity({
      name: 'view',
      data: {
        type: 'url',
        url: this.url
      }
    });
  };

  document.addEventListener('homescreen-ready', function(e) {
    var adView = new AdView(window.GridManager);
    adView.createAdPage();
    var adManager = new AdManager(adView);
    adManager.setupAds();

    GridManager.goToLandingPage = function() {
      document.body.dataset.transitioning = 'true';
      // if we have ads the home button should go to page 1, not 0
      GridManager.goToPage(AdView ? 1 : 0);
    };
  }, false);

})(window);
