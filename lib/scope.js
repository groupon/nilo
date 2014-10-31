'use strict';

var createContainer = require('./container');
var createTarget = require('./target');

function Scope(name) {
  this._name = name;
  this._registry = {};
}

Scope.prototype.register =
function register(name, init) {
  this._registry[name] = createTarget(init);
  return this;
};

Scope.prototype.canCreate =
function canCreate(name) {
  return this._registry.hasOwnProperty(name);
};

Scope.prototype.create =
function create(name, context) {
  var init = this._registry[name];
  return init(context);
};

Scope.prototype.createContainer =
function _createContainer(parent) {
  return createContainer(this, parent);
};

Scope.prototype.setArguments = function(argNames) {
  argNames.forEach(function(arg, idx) {
    this.register(arg, [ '$args', function(scopeArgs) {
      return scopeArgs[idx];
    }]);
  }, this);
};

function createScope(name) {
  return new Scope(name);
}

module.exports = createScope;
createScope['default'] = createScope;
