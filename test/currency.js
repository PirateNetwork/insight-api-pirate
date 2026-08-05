'use strict';

var should = require('should');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var EventEmitter = require('events').EventEmitter;
var CurrencyController = require('../lib/currency');

// The real endpoint (CoinGecko's simple price API, with
// include_market_cap=true) returns
// {"pirate-chain": {"usd": N, "usd_market_cap": N}} - lib/currency.js
// reads that shape.
var coingeckoData = {
  'pirate-chain': {
    usd: 237.90,
    usd_market_cap: 47851940
  }
};

function makeFakeHttps(statusCode, body, err) {
  return {
    get: function(url, options, callback) {
      // lib/currency.js now calls https.get(url, options, callback) to
      // set a User-Agent header - support both that and the 2-arg form.
      if (typeof options === 'function') {
        callback = options;
      }
      var res = new EventEmitter();
      var req = new EventEmitter();
      if (err) {
        setImmediate(function() {
          req.emit('error', err);
        });
        return req;
      }
      setImmediate(function() {
        callback(res);
        res.emit('data', body);
        res.emit('end');
      });
      res.statusCode = statusCode;
      return req;
    }
  };
}

describe('Currency', function() {

  it.skip('will make live request to bitstamp', function(done) {
    var currency = new CurrencyController({});
    var req = {};
    var res = {
      jsonp: function(response) {
        response.status.should.equal(200);
        should.exist(response.data.bitstamp);
        (typeof response.data.bitstamp).should.equal('number');
        done();
      }
    };
    currency.index(req, res);
  });

  it('will retrieve a fresh value', function(done) {
    var TestCurrencyController = proxyquire('../lib/currency', {
      https: makeFakeHttps(200, JSON.stringify(coingeckoData))
    });
    var node = {
      log: {
        error: sinon.stub()
      }
    };
    var currency = new TestCurrencyController({node: node});
    currency.bitstampRate = 220.20;
    currency.timestamp = Date.now() - 61000 * CurrencyController.DEFAULT_CURRENCY_DELAY;
    var req = {};
    var res = {
      jsonp: function(response) {
        response.status.should.equal(200);
        should.exist(response.data.bitstamp);
        response.data.bitstamp.should.equal(237.90);
        response.data.marketCapUsd.should.equal(47851940);
        done();
      }
    };
    currency.index(req, res);
  });

  it('will log an error from request', function(done) {
    var TestCurrencyController = proxyquire('../lib/currency', {
      https: makeFakeHttps(null, null, new Error('test'))
    });
    var node = {
      log: {
        error: sinon.stub()
      }
    };
    var currency = new TestCurrencyController({node: node});
    currency.bitstampRate = 237.90;
    currency.timestamp = Date.now() - 65000 * CurrencyController.DEFAULT_CURRENCY_DELAY;
    var req = {};
    var res = {
      jsonp: function(response) {
        response.status.should.equal(200);
        should.exist(response.data.bitstamp);
        response.data.bitstamp.should.equal(237.90);
        node.log.error.callCount.should.equal(1);
        done();
      }
    };
    currency.index(req, res);
  });

  it('will retrieve a cached value', function(done) {
    var getSpy = sinon.spy();
    var TestCurrencyController = proxyquire('../lib/currency', {
      https: {get: getSpy}
    });
    var node = {
      log: {
        error: sinon.stub()
      }
    };
    var currency = new TestCurrencyController({node: node});
    currency.bitstampRate = 237.90;
    currency.timestamp = Date.now();
    var req = {};
    var res = {
      jsonp: function(response) {
        response.status.should.equal(200);
        should.exist(response.data.bitstamp);
        response.data.bitstamp.should.equal(237.90);
        getSpy.callCount.should.equal(0);
        done();
      }
    };
    currency.index(req, res);
  });

});
