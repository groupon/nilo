/*
 * Copyright (c) 2019, Groupon
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 *
 * Neither the name of GROUPON nor the names of its contributors may be
 * used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
 * PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

const util = require('util');

const { parseDependencyQuery } = require('./query');

/** @typedef {import('../typedefs').Scope} Scope */
/** @typedef {import('../typedefs').MultiValuedDependencyProvider} MultiValuedDependencyProvider */
/** @typedef {import('../typedefs').DependencyDescriptor} DependencyDescriptor */
/** @typedef {import('../typedefs').DependencyQuery} DependencyQuery */

const INSPECT = util.inspect.custom;

const PROVIDER_HANDLER = {
  /**
   * @param {Injector} injector
   * @param {string | symbol} key
   */
  get(injector, key) {
    switch (key) {
      case 'constructor':
      case 'get':
      case 'keys':
      case 'scope':
        return injector[key];

      case INSPECT:
        // @ts-ignore
        return injector[INSPECT];

      default:
        return injector.get(key);
    }
  },

  set(/* injector, key, value */) {
    throw new TypeError('The dependency object may not be mutated');
  },

  /**
   * @param {Injector} injector
   * @param {string} key
   */
  has(injector, key) {
    return injector.scope.has(key);
  },

  isExtensible() {
    return false;
  },

  ownKeys() {
    // Mask implementation details like `scope` and `state`
    return ['get', 'keys', INSPECT];
  },
};

/**
 * @typedef ProviderMethods
 * @prop {typeof Injector.prototype.get} get
 * @prop {typeof Injector.prototype.keys} keys
 */

/** @typedef {{ [key: string]: unknown } & ProviderMethods} Provider */

/**
 * @param {symbol | string} symbolOrString
 */
function toString(symbolOrString) {
  return typeof symbolOrString === 'symbol'
    ? symbolOrString.toString()
    : String(symbolOrString);
}

class Injector {
  /**
   * @param {Scope} scope
   * @param {Map<string, any> | undefined} init
   * @param {Injector | undefined} parent
   */
  constructor(scope, init, parent) {
    this.scope = scope;
    this.state = init || new Map();
    this.parent = parent || null;

    this.provider = /** @type {Provider} */ (new Proxy(this, PROVIDER_HANDLER));
    this.keys = this._keys.bind(this);
    this.get = this._get.bind(this);
  }

  [INSPECT]() {
    return `Injector<${this.scope.name}> { ${this.keys()
      .map(toString)
      .join(', ')} }`;
  }

  _keys() {
    /** @type {(string | symbol)[]} */
    const scopeKeys = [];
    /** @type {Injector | null} */
    let injector;
    for (injector = this; injector !== null; injector = injector.parent) {
      scopeKeys.push(...injector.state.keys());
      scopeKeys.push(...injector.scope.getKeys());
    }
    return scopeKeys;
  }

  /**
   * @param {string | symbol} key
   */
  _collectMultiValuedProviders(key) {
    /** @type {Map<string, any>} */
    const mergedMap = this.parent
      ? this.parent['_collectMultiValuedProviders'](key)
      : new Map();

    if (this.scope.has(key)) {
      const byIndex = this.scope.getOwnMultiValuedProviders(key);
      for (const entry of byIndex) {
        mergedMap.set(entry[0], entry[1].bind(null, this));
      }
    }

    return mergedMap;
  }

  /**
   * @param {DependencyQuery} query
   * @returns {unknown[] & { [key: string]: unknown }}
   */
  _multiGet(query) {
    const dependency = parseDependencyQuery(query);
    const key = dependency.key;

    if (dependency.multiValued && dependency.index) {
      throw new Error('Cannot request index of multi-valued field');
    }
    const providerMap = this._collectMultiValuedProviders(key);
    this.state.set(key, undefined); // cycle protection
    try {
      const arr = /** @type {unknown} */ ([]);
      const instances = /** @type {unknown[] & { [key: string]: unknown }} */ (
        arr
      );
      for (const [index, boundProvider] of providerMap) {
        const instance = boundProvider();
        instances.push(instance);
        instances[index] = instance;
      }
      this.state.set(key, instances);
      return instances;
    } catch (e) {
      this.state.delete(key);
      throw e;
    }
  }

  /**
   * @param {string | symbol | DependencyDescriptor} query
   * @returns {unknown}
   */
  _get(query) {
    const dependency = parseDependencyQuery(query);
    const { key, optional, multiValued } = dependency;

    if (this.state.has(key)) {
      return this.state.get(key);
    }

    if (multiValued) {
      return this._multiGet(dependency);
    }

    if (this.scope.has(key)) {
      this.state.set(key, undefined); // cycle protection
      try {
        const instance = this.scope.create(key, this);
        this.state.set(key, instance);
        return instance;
      } catch (e) {
        this.state.delete(key);
        throw e;
      }
    } else if (this.parent) {
      return this.parent.get(dependency);
    } else if (optional) {
      this.state.set(key, undefined);
      return undefined; // eslint-disable-line consistent-return
    }
    throw Object.assign(new Error(`Unknown dependency key ${toString(key)}`), {
      code: 'INVALID_DEPENDENCY_KEY',
      scope: this.scope.name,
      key,
    });
  }

  getProvider() {
    return this.provider;
  }
}
module.exports = /** @type {typeof import('../typedefs').Injector} */ (
  Injector
);
