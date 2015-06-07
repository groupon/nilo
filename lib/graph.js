'use strict';

const Annotation = require('footnote'),
      scan = Annotation.scan;

const Scope = require('./scope');
const Annotations = require('./annotations'),
      Provides = Annotations.Provides;

function makeProvider(result) {
  if (result.ctx) {
    const ctx = result.ctx, key = result.key;
    return function provide(tag, scope) {
      return scope.callMethod(ctx, ctx[key]);
    };
  } else if (result.ctor) {
    const ctor = result.ctor, key = result.key;
    return function provide() {
      const instance = new ctor();
      return instance[key]();
    }
  } else {
    return function provide(tag, scope) {
      return scope.call(result.target);
    }
  }
}

class Graph {
  constructor(spec) {
    this._providers = new Map();
    if (spec) {
      this.scan(spec);
    }
  }

  value(tag, instance) {
    function getValue() { return instance; }
    this._providers.set(tag, getValue);
    return this;
  }

  hasProvider(tag) {
    return this._providers.has(tag);
  }

  getProvider(tag) {
    return this._providers.get(tag);
  }

  createScope(parent) {
    return new Scope(this, parent);
  }

  scan(spec) {
    const results = scan(spec, Provides);
    for (const result of results) {
      const tag = result.annotation.tag;
      this._providers.set(tag, makeProvider(result));
    }
  }
}

module.exports = Graph;
Graph['default'] = Graph;
