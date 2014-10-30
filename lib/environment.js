'use strict';

var Bluebird = require('bluebird');

var createTarget = require('./target');
var createScope = require('./scope');

var nextIndex = 1;

function Environment(key) {
  this._scopes = {};
  this._key = key || '$quinn-inject' + (nextIndex++);
  this._rootScope = this.getScope('root');
  this._root = this._rootScope.createContainer();
}

Environment.prototype.getRootScope = function() {
  return this._rootScope;
}

Environment.prototype.getScope = function(name) {
  var scope = this._scopes[name];
  if (!scope) {
    scope = this._scopes[name] = createScope(name);
    this[name] = this.createEntryPoint.bind(this, scope);
  }
  return scope;
};

Environment.prototype._extractContainer =
function _extractContainer(obj) {
  var magicProperty = obj && obj[this._key];
  if (!magicProperty) return this._root;
  return magicProperty;
};

Environment.prototype._saveContainer =
function _saveContainer(obj, container) {
  obj[this._key] = container;
};

Environment.prototype.runInScope = function(scope, args, callback) {
  var self = this;

  if (typeof scope === 'string') scope = this.getScope(scope);

  if (scope === this._rootScope) {
    if (args && args.length) {
      throw new Error('Root scope does not support arguments');
    }

    return new Bluebird(function(resolve) {
      resolve(callback(self._root));
    });
  }

  var trackerArg = args[0];
  if (trackerArg === null || typeof trackerArg !== 'object') {
    throw new Error('Requires at least one argument for tracking');
  }
  var previous = this._extractContainer(trackerArg);
  var container = scope.createContainer(previous);
  container.set('$args', args);
  this._saveContainer(trackerArg, container);

  return new Bluebird(function(resolve) {
    resolve(callback(container));
  }).finally(function() {
    self._saveContainer(trackerArg, previous);
  });
};

var __slice = Array.prototype.slice;
Environment.prototype.createEntryPoint = function(scope, init) {
  var self = this;

  if (typeof scope === 'string') scope = this.getScope(scope);

  init = createTarget(init);
  function enterScope() {
    var args = __slice.call(arguments);
    return self.runInScope(scope, args, init);
  };

  enterScope.fn = init.fn;
  enterScope.dependencies = init.dependencies;

  return enterScope;
};

function createEnvironment() {
  return new Environment();
}

module.exports = createEnvironment;
createEnvironment['default'] = createEnvironment;
