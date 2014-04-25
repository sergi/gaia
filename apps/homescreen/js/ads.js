'use strict';

/*global GridManager MozActivity dump */
(function(exports) {

  var AdData = {
    activationText: 'এই একটি বিজ্ঞাপন হয়',
    id: 'Ad',
    images: {
      summary: 'style/images/20140411_firefox_assets_010_promo-card-image_SCALED-DOWN.png',
      details: 'style/images/20140411_firefox_assets_002_promo-card-image.png'
    },
    text: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit',
    type: 'ad'
  };

  var OfferData = {
    activationText: 'এটি একটি বিশেষ বিজ্ঞাপন হয়',
    id: 'Offer',
    images: {
      summary: 'style/images/20140411_firefox_assets_011_promo-card-grameenphone-image_SCALED-DOWN.png',
      details: 'style/images/20140411_firefox_assets_003_promo-card-grameenphone-image.png'
    },
    text: 'Lorem ipsum dolor sit amet, consectetur adipisicing elit',
    type: 'telenor'
  };

  var ScrollDirection = {
    BACKWARD: 0,
    FORWARD: 1
  };

  var AdManager = exports.AdManager =  function(gridManager) {
    var self = this;

    this.cardsList = {};
    this.summaryContainer = document.createElement('div');
    this.summaryContainer.id = 'summaryContainer';
    this.detailsContainer = document.createElement('div');
    this.detailsContainer.id = 'detailsContainer';
    this.detailsWrapper = document.createElement('div');
    this.detailsWrapper.id = 'detailsWrapper';

    this.activeCard = null;
    this.dataStore = null;
    this.deviceId = null;

    this.createAdPage = function() {
      // Insert the page
      gridManager.pageHelper.addPage([], 0, 0);
      // Then get the page (which will be at index 1)
      var page = gridManager.pageHelper.getPage(1);
      // Dont save this page as its dynamic
      page.ignoreOnSave = true;

      // And grab the element so we can do stuff with it
      var el = gridManager.container.firstChild;
      el.classList.add('ad-page');

      var startEvent, currentX, currentY, startX, startY, dx, dy,
          detecting = false, swiping = false, scrolling = false,
          details = false, scrollDirection;

      el.addEventListener('gridpageshowend', function(e) {
      });
      el.addEventListener('gridpagehideend', function(e) {
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
  };

  AdManager.prototype.createCards = function() {
      var operatorCard = new OperatorCard();
      this.summaryContainer.appendChild(operatorCard.domElement);

      for (var i = 0; i < 50; i++) {
        var ad = new Ad(i);
        var detailedAd = new DetailedAd();
        if (i % 5 !== 0) {
          ad.setData(AdData);
          detailedAd.setData(AdData);
        } else {
          ad.setData(OfferData);
          detailedAd.setData(OfferData);
        }
        this.summaryContainer.appendChild(ad.domElement);
        this.detailsWrapper.appendChild(detailedAd.domElement);
      }
  };

  AdManager.prototype.showCardDetails = function (card) {
    this.currentCard = card-0;
    var translateOffset = card === '0' ? 0 : (card * -395) + 20;
    this.detailsWrapper.style.transform = 'translateY(' + translateOffset + 'px)';
  };

  AdManager.prototype.openDetails = function (card) {
    this.showCardDetails(card);
    this.detailsContainer.classList.add('active');
    setTimeout(function() {
      self.detailsWrapper.classList.add('active');
    }, 450);
  }

  AdManager.prototype.closeDetails = function () {
    this.detailsContainer.classList.remove('active');
    this.detailsWrapper.classList.remove('active');
  }

  function Card() {
    this.domElement = document.createElement('div');
    this.domElement.classList.add('card');
  }

  function OperatorCard() {
    this.domElement = document.createElement('div');
    this.domElement.classList.add('intro');
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

  Ad.prototype.setData = function (data) {
    this.domElement.classList.add('ad');
    if (data.type === 'telenor') {
      this.domElement.classList.add('telenor');
    }
    this.summaryImage.style.backgroundImage = 'url(' + data.images.summary + ')';
    this.summaryContent.textContent = data.text;
  };

  function DetailedAd() {
    Card.call(this);

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

    this.domElement.appendChild(this.image);
    this.domElement.appendChild(this.cardDetailsContainer);
    this.domElement.appendChild(this.content);
    this.domElement.appendChild(this.activationButton);
  }

  DetailedAd.prototype.constructor = DetailedAd;

  DetailedAd.prototype.setData = function (data) {
    this.domElement.classList.add('ad');
    if (data.type === 'telenor') {
      this.domElement.classList.add('telenor');
    }
    this.image.src = data.images.details;
    this.content.textContent = data.text;
    this.activationText.textContent = data.activationText;
  };

  document.addEventListener('homescreen-ready', function(e) {
    var adManager = new AdManager(window.GridManager);
    adManager.createAdPage();

    GridManager.goToLandingPage = function() {
      document.body.dataset.transitioning = 'true';
      // if we have ads the home button should go to page 1, not 0
      GridManager.goToPage(adManager ? 1 : 0);
    };
  }, false);

})(window);
