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

const Scope = require('./scope');

/**
 * @typedef {import('../typedefs').ScopeNode} ScopeNode
 * @typedef {import('../typedefs').ScopeEntry} ScopeEntry
 * @typedef {import('http').IncomingMessage} IncomingMessage
 * @typedef {import('http').ServerResponse} ServerResponse
 */

class Registry {
  constructor() {
    this.singleton = new Scope('singleton');
    this.request = new Scope('request');
    this.action = new Scope('action');
  }

  /**
   * @param {ScopeEntry[]} decls
   */
  static from(decls) {
    const reg = new Registry();
    for (const entry of decls) {
      if (typeof entry === 'function') entry(reg);
      else {
        const [scope, name, value] = entry;
        reg[scope].setValue(name, value);
      }
    }
    return reg;
  }

  /**
   * @returns {ScopeNode}
   */
  getProviderGraph() {
    const action = {
      name: 'action',
      providers: this.action.getProviderNodes(),
      children: [],
    };
    const request = {
      name: 'request',
      providers: this.request.getProviderNodes(),
      children: [action],
    };
    const singleton = {
      name: 'singleton',
      providers: this.singleton.getProviderNodes(),
      children: [request],
    };

    return singleton;
  }

  getSingletonInjector() {
    return this.singleton.getCachedInjector(this);
  }

  /**
   * @param {IncomingMessage} [req]
   * @param {ServerResponse} [res]
   */
  getRequestInjector(
    req = /** @type {IncomingMessage} */ ({}),
    res = /** @type {ServerResponse} */ ({})
  ) {
    const singletonInjector = this.getSingletonInjector();
    return this.request.getCachedInjector(
      req,
      new Map(
        /** @type {[string, any][]} */ ([
          ['request', req],
          ['response', res],
        ])
      ),
      singletonInjector
    );
  }

  /**
   * @param {IncomingMessage} [req]
   * @param {ServerResponse} [res]
   * @param {Object} [action]
   */
  getActionInjector(req, res, action = {}) {
    const requestInjector = this.getRequestInjector(req, res);
    return this.action.createInjector(
      new Map([['action', action]]),
      requestInjector
    );
  }
}
module.exports = /** @type {typeof import('../typedefs').Registry} */ (Registry);
