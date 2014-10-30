'use strict';

function Container(scope, parent) {
  this._scope = scope;
  this._parent = parent || null;
  this._cache = {};
}

Container.prototype._create =
function _create(name) {
  var scope = this._scope;
  var parent = this._parent;

  if (scope.canCreate(name)) {
    return scope.create(name, this);
  } else if (parent) {
    return parent.get(name);
  }
  throw new Error('Unknown component: ' + name);
};

Container.prototype.get =
function get(name) {
  var cache = this._cache;

  if (!cache.hasOwnProperty(name))
    return this.set(name, this._create(name));
  else
    return cache[name];
};

Container.prototype.set =
function set(name, value) {
  this._cache[name] = value;
  return value;
};

function createContainer(scope, parent) {
  return new Container(scope, parent);
}

module.exports = createContainer;
createContainer['default'] = createContainer;
