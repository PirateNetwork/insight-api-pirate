'use strict';

var sinon = require('sinon');
var should = require('should');
var ChartController = require('../lib/charts');

describe('Chart', function() {
  describe('#_miningRevenueChart', function() {
    var blocks = [
      {height: 100, reward: 6, tx: ['txid1', 'txid2']}
    ];

    it('propagates a getDetailedTransaction error instead of throwing', function(done) {
      var node = {
        getDetailedTransaction: sinon.stub().callsArgWith(1, new Error('No information available about transaction'))
      };
      var chart = new ChartController({node: node});

      chart._miningRevenueChart(blocks, function(err, result) {
        should.exist(err);
        should.not.exist(result);
        done();
      });
    });

    it('computes revenue as reward plus fees when all lookups succeed', function(done) {
      var node = {
        getDetailedTransaction: sinon.stub()
      };
      node.getDetailedTransaction.withArgs('txid1').callsArgWith(1, null, {feeSatoshis: 1000});
      node.getDetailedTransaction.withArgs('txid2').callsArgWith(1, null, {feeSatoshis: 2000});
      var chart = new ChartController({node: node});

      chart._miningRevenueChart(blocks, function(err, result) {
        should.not.exist(err);
        result.data.json.revenue[0].should.equal(((6e8 + 3000) / 1e8).toFixed(8));
        done();
      });
    });
  });
});
