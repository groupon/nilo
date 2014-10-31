'use strict';

var Bluebird = require('bluebird');

var createTarget = require('./target');
var createScope = require('./scope');

var nextIndex = 1;

var __slice = Array.prototype.slice;

function createEnvironment(key) {
  key = key || '$quinn-inject' + (nextIndex++);
  var _scopes = {};
  var _rootScope = getScope('root');
  var _root = _rootScope.createContainer();

  function _extractContainer(obj) {
    var magicProperty = obj && obj[key];
    if (!magicProperty) return _root;
    return magicProperty;
  }

  function _saveContainer(obj, container) {
    obj[key] = container;
  }

  function getScope(name) {
    var scope = _scopes[name];
    if (!scope) {
      scope = _scopes[name] = createScope(name);
      inject[name] = createEntryPoint.bind(null, scope);
    }
    return scope;
  }

  function getRootScope() {
    return _rootScope;
  }

  function runInScope(scope, args, callback) {
    if (typeof scope === 'string') {
      scope = getScope(scope);
    }

    if (scope === _rootScope) {
      if (args && args.length) {
        throw new Error('Root scope does not support arguments');
      }

      return new Bluebird(function(resolve) {
        resolve(callback(_root));
      });
    }

    var trackerArg = args[0];
    if (trackerArg === null || typeof trackerArg !== 'object') {
      throw new Error('Requires at least one argument for tracking');
    }
    var previous = _extractContainer(trackerArg);
    var container = scope.createContainer(previous);
    container.set('$args', args);
    _saveContainer(trackerArg, container);

    return new Bluebird(function(resolve) {
      resolve(callback(container));
    }).finally(function() {
      _saveContainer(trackerArg, previous);
    });
  }

  function createEntryPoint(scope, init) {
    if (typeof scope === 'string') {
      scope = getScope(scope);
    }

    init = createTarget(init);

    function enterScope() {
      var args = __slice.call(arguments);
      return runInScope(scope, args, init);
    }

    enterScope.fn = init.fn;
    enterScope.dependencies = init.dependencies;

    return enterScope;
  }

  function inject(init) {
    return function(trackerArg) {
      var container = _extractContainer(trackerArg);
      init = createTarget(init);
      return new Bluebird(function(resolve) {
        resolve(init(container));
      });
    };
  }

  inject.getScope = getScope;
  inject.getRootScope = getRootScope;
  inject.runInScope = runInScope;
  inject.createEntryPoint = createEntryPoint;

  return inject;
}

module.exports = createEnvironment;
createEnvironment['default'] = createEnvironment;
