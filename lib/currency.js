'use strict';

var https = require('https');

// Minimal (err, response, body) callback shape, matching the deprecated
// `request` package this replaces, so callers/tests don't need to change.
//
// CoinGecko's API rejects requests with no User-Agent header (a bare
// https.get() sends none) with a 403 asking for "a descriptive
// User-Agent" - curl sends one by default, which is why this looked
// fine when tested with curl but silently failed from Node. TreasureChest's
// own Qt wallet (src/qt/overviewpage.cpp, src/params.cpp) hits this same
// CoinGecko endpoint with User-Agent "Pirate" - match that exactly.
function httpGetJSON(url, callback) {
  var options = {headers: {'User-Agent': 'Pirate', 'Accept': 'application/json'}};
  https.get(url, options, function(res) {
    var body = '';
    res.on('data', function(chunk) {
      body += chunk;
    });
    res.on('end', function() {
      callback(null, {statusCode: res.statusCode}, body);
    });
  }).on('error', function(err) {
    callback(err);
  });
}

function CurrencyController(options) {
  this.node = options.node;
  var refresh = options.currencyRefresh || CurrencyController.DEFAULT_CURRENCY_DELAY;
  this.currencyDelay = refresh * 60000;
  this.bitstampRate = 0; // ARRR/USD
  this.marketCapUsd = 0;
  this.poloniexRate = 1; // unused multiplier, kept for response-shape compatibility
  this.timestamp = Date.now();
}

CurrencyController.DEFAULT_CURRENCY_DELAY = 10;

// The previous source (CoinMarketCap's v1 ticker API) was retired years
// ago (now returns a 403 from CloudFront) and was fetching Komodo's
// price, not Pirate Chain's, even when it worked - use the same
// CoinGecko endpoint (and coin id, "pirate-chain") TreasureChest's own
// Qt wallet already relies on, which also conveniently reports market
// cap directly rather than needing it computed from a locally-observed
// circulating supply.
CurrencyController.PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=pirate-chain&vs_currencies=usd&include_market_cap=true';

CurrencyController.prototype.index = function(req, res) {
  var self = this;
  var currentTime = Date.now();
  if (self.bitstampRate === 0 || currentTime >= (self.timestamp + self.currencyDelay)) {
    self.timestamp = currentTime;

    httpGetJSON(CurrencyController.PRICE_URL, function(err, response, body) {
      if (err) {
        self.node.log.error(err);
      }
      if (!err && response.statusCode === 200) {
        var parsed = JSON.parse(body);
        var ticker = parsed['pirate-chain'];
        if (ticker && typeof ticker.usd === 'number') {
          self.bitstampRate = ticker.usd;
        }
        if (ticker && typeof ticker.usd_market_cap === 'number') {
          self.marketCapUsd = ticker.usd_market_cap;
        }
      }
      res.jsonp({
        status: 200,
        data: {
          bitstamp: self.bitstampRate * self.poloniexRate,
          marketCapUsd: self.marketCapUsd
        }
      });
    });
  } else {
    res.jsonp({
      status: 200,
      data: {
        bitstamp: self.bitstampRate * self.poloniexRate,
        marketCapUsd: self.marketCapUsd
      }
    });
  }

};

module.exports = CurrencyController;
