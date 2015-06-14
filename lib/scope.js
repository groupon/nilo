'use strict';

const Annotation = require('footnote'),
      scan = Annotation.scan;

const Annotations = require('./annotations'),
      Inject = Annotations.Inject;

const _bind = Function.prototype.bind;

function getParamTypeTags(f) {
  if (!(Reflect && typeof Reflect.getMetadata === 'function')) {
    return null;
  }
  return Reflect.getMetadata('design:paramtypes', f) || null;
}

function getEmptyTags(f) {
  return f.length === 0 ? [] : null;
}

function getInjectTags(ctor) {
  const results = scan(ctor, Inject);
  if (results.length === 0) return null;
  const tags = results[0].annotation.tags;
  if (tags.length === 0) {
    return getParamTypeTags(ctor) || getEmptyTags(ctor);
  }
  return tags;
}

function hasInject(target) {
  const tags = getInjectTags(target);
  return tags !== null;
}

function isSingleton(thing) {
  return true;
}

class Scope {
  constructor(graph, parent) {
    this._graph = graph;
    this._parent = parent || null;
    this._singletons = new Map();
  }

  construct(ctor, tags) {
    tags = tags || getInjectTags(ctor) || [];
    const deps = tags.map(this.get, this);
    return new (_bind.apply(ctor, [null].concat(deps)))();
  }

  call(fn, tags) {
    tags = tags || getInjectTags(fn) || [];
    const deps = tags.map(this.get, this);
    return fn.apply(null, deps);
  }

  callMethod(object, method, tags) {
    tags = tags || getInjectTags(method) || [];
    const deps = tags.map(this.get, this);
    return method.apply(object, deps);
  }

  _maybeCache(tag, value, marker) {
    if (isSingleton(marker)) {
      this._singletons.set(tag, value);
    }
    return value;
  }

  get(tag) {
    if (this._singletons.has(tag)) {
      return this._singletons.get(tag);
    }

    if (this._graph.hasProvider(tag)) {
      const provider = this._graph.getProvider(tag);
      const value = provider(tag, this);
      return this._maybeCache(tag, value, provider);
    } else if (typeof tag === 'function' && hasInject(tag)) {
      // Try to treat as injectable class
      return this._maybeCache(tag, this.construct(tag), tag);
    } else if (this._parent !== null) {
      return this._parent.get(tag);
    }
    throw new Error(`Can't construct dependency ${tag}`);
  }

  set(tag, value) {
    this._singletons.set(tag, value);
    return this;
  }
}

module.exports = Scope;
Scope['default'] = Scope;
