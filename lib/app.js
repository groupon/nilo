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

const Project = require('./project');
const Registry = require('./registry');

const dumpObjectGraph = require('./commands/dump-object-graph');

/**
 * @param {App} app
 */
async function initializeApp(app) {
  const objectGraphFiles = await app.project.loadInterfaceFiles('object-graph');

  for (const { defaultExport: provider, specifier } of objectGraphFiles) {
    if (typeof provider !== 'function') {
      throw new TypeError(
        `Expected a function as the default export of object-graph file ${specifier}`
      );
    }
    provider(app.registry);
  }

  app.registry.singleton.setFactory('commands[dump-object-graph]', null, () => {
    return dumpObjectGraph;
  });
}

/**
 * @param {App} app
 */
async function configureApp(app) {
  await app.initialize();

  await app.runAll('configure[]');
  await app.runAll('afterConfigure[]');
}

/**
 * @param {() => any} fn
 */
function once(fn) {
  /** @type {{ error: Error, data: any } | null} */
  let result = null;
  return () => {
    if (result === null) {
      let error = null;
      let data = null;
      try {
        data = fn();
      } catch (e) {
        error = e;
      }
      result = { data, error };
    }
    if (result.error) throw result.error;
    return result.data;
  };
}

class App {
  /**
   * @param {string} appDirectory
   * @param {string} frameworkDirectory
   */
  constructor(appDirectory, frameworkDirectory) {
    this.project = new Project(appDirectory, frameworkDirectory);

    this.registry = new Registry();
    this.registry.singleton.setFactory('app', null, () => this);
    this.registry.singleton.setFactory('project', null, () => this.project);
    this.registry.singleton.setFactory('registry', null, () => this.registry);

    this.initialize = once(initializeApp.bind(null, this));
    this.configure = once(configureApp.bind(null, this));
  }

  get appDirectory() {
    return this.project.root;
  }

  /**
   * @param {string} filter
   */
  async runAll(filter) {
    const hooks = /** @type {((app: App) => Promise<void>)[]} */ (
      this.registry.getSingletonInjector().get(filter)
    );

    await Promise.all(hooks.map(hook => hook(this)));
  }
}

module.exports = /** @type {typeof import('./typedefs').App} */ (App);
