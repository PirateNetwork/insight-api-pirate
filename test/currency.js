'use strict';

var should = require('should');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var EventEmitter = require('events').EventEmitter;
var CurrencyController = require('../lib/currency');

// The real endpoint (CoinMarketCap v1) returns a JSON array of ticker
// objects, not a bare object - lib/currency.js reads `[0].price_usd`.
var coinmarketcapData = [
  {
    id: 'komodo',
    symbol: 'KMD',
    name: 'Komodo',
    price_usd: '237.90',
    price_btc: '0.0123'
  }
];

function makeFakeHttps(statusCode, body, err) {
  return {
    get: function(url, callback) {
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
      https: makeFakeHttps(200, JSON.stringify(coinmarketcapData))
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
