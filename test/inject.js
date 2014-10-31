/*global before, describe, it */
'use strict';

var assert = require('assertive');

var createEnv = require('../');

describe('inject', function() {
  describe('with root scope', function() {
    var inject;
    before(function() {
      inject = createEnv();
      inject.getRootScope()
        .register('x', function() { return 3; })
        .register('y', function() { return 10; });
    });

    it('can inject global objects', function(done) {
      var getSum = inject(function(x, y) { return x + y; });

      getSum()
        .then(function(sum) {
          assert.equal(13, sum);
        })
        .nodeify(done);
    });
  });
});
