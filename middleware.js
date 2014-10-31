'use strict';

var Bluebird = require('bluebird');

module.exports = function(inject, scope) {
  return function(req, res, next) {
    inject.runInScope(scope, [ req, res ],
      function() {
        return new Bluebird(function(resolve) {
          res.on('finish', resolve);
          res.on('close', resolve);
          next();
        });
      }
    );
  };
};
