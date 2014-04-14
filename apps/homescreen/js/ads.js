/*global GridManager MozActivity dump */
(function(exports) {
  var AdManager = exports.AdManager =  function(gridManager) {
    var self = this;

    this.cardsList = {};
    this.summaryContainer = document.createElement('div');
    this.summaryContainer.id = 'summaryContainer';
    this.detailsContainer = document.createElement('div');
    this.detailsContainer.id = 'detailsContainer';

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
          detecting = swiping = scrolling = details = false;

      el.addEventListener('gridpageshowend', function(e) {
      });
      el.addEventListener('gridpagehideend', function(e) {
      });

      el.addEventListener('touchstart', function(e) {
        startEvent = e;
        detecting = true;
        startX = startEvent.touches[0].pageX;
        startY = startEvent.touches[0].pageY;
      });
      el.addEventListener('touchmove', function(e) {
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
      el.addEventListener('touchend', function(e) {
        if (swiping === false && scrolling === false) {
          if (details === false) {
            var card = self.cardsList[e.target.dataset.cardId];
            if (card) {
              console.log(card);
              self.showCardDetails(card);
              details = true;
            }
          } else {
            self.detailsContainer.classList.remove("active");
            details = false;
          }
        }
        detecting = scrolling = false;
      });

      this.createCards();

      el.appendChild(this.summaryContainer);
      el.appendChild(this.detailsContainer);

      return el;
    };
  };

  AdManager.prototype.createCards = function() {
      var operatorCard = new OperatorCard();
      this.summaryContainer.appendChild(operatorCard.domElement);

      for (var i = 1; i < 11; i++) {
        var ad = new Ad(i);
        this.summaryContainer.appendChild(ad.domElement);
        this.cardsList[ad.cardId] = ad;
      }
  }

  AdManager.prototype.showCardDetails = function (card) {
    this.detailsContainer.classList.add("active");
  }

  function Card() {
    this.domElement = document.createElement('div');
    this.domElement.classList.add('card');
  }

  function OperatorCard() {
    Card.call(this);
    this.domElement.classList.add('introCard');
  }

  OperatorCard.prototype = Card.prototype;
  OperatorCard.prototype.constructor = OperatorCard;

  function Ad(adId) {
    Card.call(this);
    this.domElement.classList.add('ad');
    this.domElement.dataset.cardId = adId;
    this.cardId = adId;

    this.summaryImage = document.createElement('img');
    this.summaryImage.classList.add('summaryImage');
    this.summaryContent = document.createElement('p');
    this.summaryContent.classList.add('summaryContent');

    this.summaryImage.src = "placeholder-100x144.jpg";
    this.summaryContent.textContent = "Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."

    this.domElement.appendChild(this.summaryImage);
    this.domElement.appendChild(this.summaryContent);
  }

  Ad.prototype = Card.prototype;
  Ad.prototype.constructor = Ad;

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
