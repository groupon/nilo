'use strict';

var createEnvironment = require('../lib/inject');

var inject = createEnvironment();

var requestScope = inject.getScope('request');
requestScope.setArguments([ 'req', 'res' ]);

requestScope.register('query', function(req) {
  return req.query;
});

var actionScope = inject.getScope('action');
actionScope.setArguments([ 'req', 'params' ]);

actionScope.register('I18n', function(params) {
  return {
    locale: 'en_US',
    lang: 'en',
    scope: [ params.controllerName ],
    data: {
      posts: {
        hello: 'Hello World'
      }
    },
    translate: function(key) {
      var keyPath = key.split('.');
      if (keyPath[0] === '') {
        keyPath = this.scope.concat(keyPath.slice(1));
      }
      return keyPath.reduce(function(node, prop) {
        return node && node[prop];
      }, this.data);
    }
  }
});

module.exports = inject;
