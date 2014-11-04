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

    describe('with "local" scope', function() {
      var _tracker = {};

      before(function() {
        inject.getScope('local')
          .register('l1', function(x, y, two) { return x + y + two; })
          .register('tracker', function($args) { return $args[0]; })
          .register('two', function($args) { return $args[1]; })
          .register('y', function() { return 25; });
      });

      it('shadows global objects', function(done) {
        inject.runInScope('local', [_tracker, 2], function() {
          var getStuff = inject(function(l1, tracker) {
            return [ l1, tracker ];
          });

          return getStuff(_tracker)
            .spread(function(l1, tracker) {
              assert.equal(tracker, _tracker);
              assert.equal(l1, 3 + 25 + 2);
            });
        }).nodeify(done);
      });

      it('does not pollute the tracker object too much', function(done) {
        inject.runInScope('locale', [_tracker], function() {
          assert.equal('{}', JSON.stringify(_tracker));
          assert.deepEqual({}, _tracker);
        }).nodeify(done);
      });
    });
  });
});
