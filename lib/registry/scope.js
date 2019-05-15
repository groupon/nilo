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

const Injector = require('./injector');
const { parseDependencyQuery } = require('./query');

/**
 * @typedef {import('../typedefs').DependencyQuery} DependencyQuery
 * @typedef {import('../typedefs').SimpleDependencyProvider} SimpleDependencyProvider
 * @typedef {import('../typedefs').MultiValuedDependencyProvider} MultiValuedDependencyProvider
 * @typedef {import('../typedefs').DependencyProvider} DependencyProvider
 */

const MULTI_VALUED = Symbol('isMultiValued');

/**
 * @param {DependencyProvider} provider
 */
function isMultiValued(provider) {
  return (
    provider &&
    provider instanceof Map &&
    // @ts-ignore
    provider[MULTI_VALUED] === true
  );
}

/**
 * @param {[string, SimpleDependencyProvider][]} [initialValues]
 * @returns {MultiValuedDependencyProvider}
 */
function createMultiValued(initialValues = []) {
  const byIndex = new Map(initialValues);
  return Object.assign(byIndex, {
    [MULTI_VALUED]: true,
  });
}

/**
 * @param {symbol | string} symbolOrString
 */
function toString(symbolOrString) {
  return typeof symbolOrString === 'symbol'
    ? symbolOrString.toString()
    : String(symbolOrString);
}

class Scope {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
    /**
     * @type {Map<string | symbol, DependencyProvider>}
     */
    this.known = new Map();
    this.cacheKey = Symbol(`di-namespace:${name}`);
  }

  /**
   * @param {string} key
   */
  has(key) {
    return this.known.has(key);
  }

  /**
   * @param {string} key
   */
  getOwnMultiValuedProviders(key) {
    const byIndex = /** @type {MultiValuedDependencyProvider} */ (this.known.get(
      key
    ));
    if (!isMultiValued(byIndex)) {
      throw Object.assign(
        new Error(`Not a multi-valued key in ${this.name}: ${key}`),
        {
          code: 'INCOMPATIBLE_DEPENDENCY_KEY',
          key,
          scope: this.name,
        }
      );
    }
    return byIndex;
  }

  /**
   * @param {DependencyQuery} query
   * @param {SimpleDependencyProvider} provider
   */
  multiSet(query, provider) {
    const dependeny = parseDependencyQuery(query);
    const key = dependeny.key;

    if (!dependeny.multiValued || !dependeny.index) {
      throw Object.assign(
        new Error(
          `Setting a multi-valued provider for ${toString(key)} in ${
            this.name
          } requires an index`
        ),
        {
          code: 'INVALID_DEPENDENCY_KEY',
          key,
          scope: this.name,
        }
      );
    }

    if (this.known.has(key)) {
      const previous = /** @type {MultiValuedDependencyProvider} */ (this.known.get(
        key
      ));
      if (!isMultiValued(previous)) {
        throw Object.assign(
          new Error(
            `${toString(key)} in ${
              this.name
            } has already been registered as single-valued`
          ),
          {
            code: 'DUPLICATE_DEPENDENCY_KEY',
            key,
            scope: this.name,
          }
        );
      }

      if (previous.has(dependeny.index)) {
        throw Object.assign(
          new Error(
            `${toString(key)}[${dependeny.index}] in ${
              this.name
            } has already been registered`
          ),
          {
            code: 'DUPLICATE_DEPENDENCY_KEY',
            key,
            index: dependeny.index,
            scope: this.name,
          }
        );
      }
      previous.set(dependeny.index, provider);
    } else {
      this.known.set(key, createMultiValued([[dependeny.index, provider]]));
    }
  }

  /**
   * @template T
   * @param {string} query
   * @param {string[] | null} deps
   * @param {(deps?: any) => T} factory
   */
  setFactory(query, deps, factory) {
    const dependeny = parseDependencyQuery(query);
    const key = dependeny.key;
    const parsedDeps =
      deps && deps.length ? deps.map(parseDependencyQuery) : null;

    const provider = parsedDeps
      ? (/** @type {Injector} */ injector) => {
          const resolvedDeps = Object.create(null);
          parsedDeps.forEach(parsedDep => {
            resolvedDeps[parsedDep.key] = injector.get(parsedDep);
          });
          return factory(resolvedDeps);
        }
      : () => factory();

    if (dependeny.multiValued) {
      return void this.multiSet(dependeny, provider);
    }

    if (this.known.has(key)) {
      throw Object.assign(
        new Error(
          `A provider for ${toString(key)} has already been registered in ${
            this.name
          }`
        ),
        {
          code: 'DUPLICATE_DEPENDENCY_KEY',
          key,
          scope: this.name,
        }
      );
    }

    this.known.set(key, provider);
  }

  /**
   * @param {string} key
   * @param {Injector} injector
   */
  create(key, injector) {
    const creator = /** @type {SimpleDependencyProvider} */ (this.known.get(
      key
    ));
    if (isMultiValued(creator)) {
      throw Object.assign(
        new Error(
          `Multi-valued keys need to be requested explicitly, e.g. ${key}[]`
        ),
        {
          code: 'INCOMPATIBLE_DEPENDENCY_KEY',
          key,
          scope: this.name,
        }
      );
    }
    return creator(injector);
  }

  getKeys() {
    return Array.from(this.known.keys());
  }

  /**
   * @param {Map<string, any>} [init]
   * @param {Injector} [parent]
   * @returns {Injector}
   */
  createInjector(init, parent) {
    return new Injector(
      /** @type {import('../typedefs').Scope} */ (this),
      init,
      parent
    );
  }

  /**
   * @param {Object} obj
   * @param {Map<string, any>} [init]
   * @param {Injector} [parent]
   */
  getCachedInjector(obj, init, parent) {
    const cacheKey = this.cacheKey;
    if (!obj[cacheKey]) {
      obj[cacheKey] = new Injector(
        /** @type {import('../typedefs').Scope} */ (this),
        init,
        parent
      );
    }
    return obj[cacheKey];
  }
}
module.exports = /** @type {typeof import('../typedefs').Scope} */ (Scope);
