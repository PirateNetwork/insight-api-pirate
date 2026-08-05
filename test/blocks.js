'use strict';

var should = require('should');
var sinon = require('sinon');
var BlockController = require('../lib/blocks');
var bitcore = require('bitcore-lib-pirate');
var _ = require('lodash');

// None of the block fixtures in this file are from a real Pirate (or
// Bitcoin) block. They're hand-built, well-formed Equihash-format blocks
// (see bitcore-lib-pirate's BlockHeader._fromBufferReader for the format)
// used purely to exercise BlockController's transform/summary logic. This
// suite was adapted from the upstream Bitcoin insight-api test vectors,
// which embedded several real historical Bitcoin blocks that don't fit
// this fork's actual block format (a fixed 80-byte Bitcoin header with a
// 4-byte nonce, vs. Pirate's version + prevHash + merkleRoot + reserved +
// time + bits + 32-byte nonce + variable-length solution) and referenced
// Bitcoin-era mining pools no longer relevant to this project's
// pools.json - no real Pirate chain data was available when this suite
// was adapted.

var PAY_SCRIPT = '76a914140a14575ad5d95bcf2e665b5c98121d7d8a03d488ac';

function makeCoinbaseTx(scriptHex) {
  return new bitcore.Transaction().fromObject({
    version: 1,
    inputs: [{
      prevTxId: '0000000000000000000000000000000000000000000000000000000000000000',
      outputIndex: 4294967295,
      sequenceNumber: 4294967295,
      script: scriptHex
    }],
    outputs: [{satoshis: 10000, script: PAY_SCRIPT}],
    nLockTime: 0
  });
}

function makeSimpleTx(seedByte) {
  return new bitcore.Transaction().fromObject({
    version: 1,
    inputs: [{
      prevTxId: new Buffer(32).fill(seedByte).toString('hex'),
      outputIndex: 0,
      sequenceNumber: 4294967295,
      script: ''
    }],
    outputs: [{satoshis: 1000, script: PAY_SCRIPT}],
    nLockTime: 0
  });
}

function makeHeader(merkleRoot, time) {
  return new bitcore.BlockHeader({
    version: 4,
    prevHash: new Buffer(32).fill(0x11),
    merkleRoot: merkleRoot,
    reserved: new Buffer(32).fill(0),
    time: time,
    bits: 0x200fffff, // an easy, regtest-style minimum difficulty target
    nonce: new Buffer(32).fill(0),
    solution: new Buffer(40).fill(0x44)
  });
}

// Computing a real merkle root requires knowing the transactions first,
// so build a throwaway block against a zero-filled header purely to
// borrow Block's merkle-tree logic, then build the real header fresh.
function makeBlock(txs, time) {
  var scratchBlock = new bitcore.Block({header: makeHeader(new Buffer(32).fill(0), time), transactions: txs});
  var header = makeHeader(scratchBlock.getMerkleRoot(), time);
  return new bitcore.Block({header: header, transactions: txs});
}

// blockA: main "block data should be correct" fixture - a coinbase plus
// two ordinary transactions, no pool signature in the coinbase script.
var blockA = makeBlock([makeCoinbaseTx('03d6250800'), makeSimpleTx(0x22), makeSimpleTx(0x33)], 1440987503);

// blockB: "block pool info should be correct" fixture - coinbase script
// contains a real, current pools.json search string (Bitfly).
var blockB = makeBlock([makeCoinbaseTx(new Buffer('/flypool/', 'utf8').toString('hex'))], 1440990000);

// blockC/blockD: "/blocks route" list fixtures - coinbase scripts contain
// another two real, current pools.json search strings (Zmine, CoinBlockers).
var blockC = makeBlock([makeCoinbaseTx(new Buffer('{ZMINE.IO}', 'utf8').toString('hex'))], 1440978683);
var blockD = makeBlock([makeCoinbaseTx(new Buffer('coinblockers.com - https://coinblockers.com', 'utf8').toString('hex'))], 1440977479);

var blockIndexes = {};
blockIndexes[blockA.hash] = {
  hash: blockA.hash,
  chainWork: '0000000000000000000000000000000000000000000000000000000000000001',
  prevHash: '1111111111111111111111111111111111111111111111111111111111111111',
  nextHash: '2222222222222222222222222222222222222222222222222222222222222222',
  confirmations: 119,
  height: 533974
};
blockIndexes[blockB.hash] = {
  hash: blockB.hash,
  prevHash: '1111111111111111111111111111111111111111111111111111111111111111',
  height: 375493
};
blockIndexes[blockC.hash] = {
  hash: blockC.hash,
  chainWork: '0000000000000000000000000000000000000000000000000000000000000002',
  prevHash: blockD.hash,
  confirmations: 119,
  height: 533951
};
blockIndexes[blockD.hash] = {
  hash: blockD.hash,
  chainWork: '0000000000000000000000000000000000000000000000000000000000000003',
  prevHash: '1111111111111111111111111111111111111111111111111111111111111111',
  height: 533950
};
blockIndexes[533974] = blockIndexes[blockA.hash];

describe('Blocks', function() {
  describe('/blocks/:blockHash route', function() {
    var insight = {
      'hash': blockA.hash,
      'confirmations': 119,
      'size': blockA.toBuffer().length,
      'height': 533974,
      'version': 4,
      'merkleroot': blockA.toObject().header.merkleRoot,
      'tx': blockA.toObject().transactions.map(function(t) { return t.hash; }),
      'time': 1440987503,
      'nonce': '0000000000000000000000000000000000000000000000000000000000000000',
      'solution': '44444444444444444444444444444444444444444444444444444444444444444444444444444444',
      'bits': '200fffff',
      'difficulty': blockA.header.getDifficulty(),
      'chainwork': '0000000000000000000000000000000000000000000000000000000000000001',
      'previousblockhash': '1111111111111111111111111111111111111111111111111111111111111111',
      'nextblockhash': '2222222222222222222222222222222222222222222222222222222222222222',
      'reward': 0.0001,
      'isMainChain': true,
      'poolInfo': {}
    };

    var node = {
      log: sinon.stub(),
      getBlock: sinon.stub().callsArgWith(1, null, blockA),
      services: {
        bitcoind: {
          getBlockHeader: sinon.stub().callsArgWith(1, null, blockIndexes[blockA.hash]),
          isMainChain: sinon.stub().returns(true),
          height: 534092
        }
      }
    };

    it('block data should be correct', function(done) {
      var controller = new BlockController({node: node});
      var req = {
        params: {
          blockHash: blockA.hash
        }
      };
      var res = {};
      var next = function() {
        should.exist(req.block);
        var block = req.block;
        should(block).eql(insight);
        done();
      };
      controller.block(req, res, next);
    });

    it('block pool info should be correct', function(done) {
      var node = {
        log: sinon.stub(),
        getBlock: sinon.stub().callsArgWith(1, null, blockB),
        services: {
          bitcoind: {
            getBlockHeader: sinon.stub().callsArgWith(1, null, blockIndexes[blockB.hash]),
            isMainChain: sinon.stub().returns(true),
            height: 534092
          }
        }
      };
      var controller = new BlockController({node: node});
      var req = {
        params: {
          blockHash: blockB.hash
        }
      };
      var res = {};
      var next = function() {
        should.exist(req.block);
        req.block.poolInfo.poolName.should.equal('Bitfly');
        req.block.poolInfo.url.should.equal('https://zcash.flypool.org/');
        done();
      };

      controller.block(req, res, next);
    });

  });

  describe('/blocks route', function() {

    var insight = {
      'blocks': [
        {
          'height': 533951,
          'size': blockC.toBuffer().length,
          'hash': blockC.hash,
          'time': 1440978683,
          'txlength': 1,
          'poolInfo': {
            'poolName': 'Zmine',
            'url': 'https://zmine.io/'
          }
        },
        {
          'height': 533950,
          'size': blockD.toBuffer().length,
          'hash': blockD.hash,
          'time': 1440977479,
          'txlength': 1,
          'poolInfo': {
            'poolName': 'CoinBlockers',
            'url': 'https://kmd.coinblockers.com'
          }
        }
      ],
      'length': 2,
      'pagination': {
        'current': '2015-08-30',
        'currentTs': 1440979199,
        'isToday': false,
        'more': false,
        'next': '2015-08-31',
        'prev': '2015-08-29'
      }
    };

    // list() reverses the hashes array before processing it, so the
    // first getRawBlock call actually corresponds to hashes[1], not [0].
    var stub = sinon.stub();
    stub.onFirstCall().callsArgWith(1, null, blockC.toBuffer());
    stub.onSecondCall().callsArgWith(1, null, blockD.toBuffer());

    var hashes = [
      blockD.hash,
      blockC.hash
    ];
    var node = {
      log: sinon.stub(),
      services: {
        bitcoind: {
          getRawBlock: stub,
          getBlockHeader: function(hash, callback) {
            callback(null, blockIndexes[hash]);
          },
          getBlockHashesByTimestamp: sinon.stub().callsArgWith(2, null, hashes)
        }
      }
    };

    it('should have correct data', function(done) {
      var blocks = new BlockController({node: node});

      var req = {
        query: {
          limit: 2,
          blockDate: '2015-08-30'
        }
      };

      var res = {
        jsonp: function(data) {
          should(data).eql(insight);
          done();
        }
      };

      blocks.list(req, res);
    });
  });

  describe('/block-index/:height route', function() {
    var node = {
      log: sinon.stub(),
      services: {
        bitcoind: {
          getBlockHeader: function(height, callback) {
            callback(null, blockIndexes[height]);
          }
        }
      }
    };

    it('should have correct data', function(done) {
      var blocks = new BlockController({node: node});

      var insight = {
        'blockHash': blockA.hash
      };

      var height = 533974;

      var req = {
        params: {
          height: height
        }
      };
      var res = {
        jsonp: function(data) {
          should(data).eql(insight);
          done();
        }
      };

      blocks.blockIndex(req, res);
    });
  });

  describe('#getBlockReward', function() {
    var node = {
      log: sinon.stub()
    };
    var blocks = new BlockController({node: node});

    it('should give the flat block reward for a block before first halvening', function() {
      blocks.getBlockReward(100000).should.equal(10000);
    });

    it('should give the flat block reward for a block between first and second halvenings', function() {
      blocks.getBlockReward(373011).should.equal(10000);
    });

    it('should give the flat block reward for a block between second and third halvenings', function() {
      blocks.getBlockReward(500000).should.equal(10000);
    });
  });
});
