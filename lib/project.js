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

const path = require('path');
const Module = require('module');
const util = require('util');

const debug = require('debug')('nilo:project');
// @ts-ignore
const esm = require('esm');
// @ts-ignore
const globCallback = require('glob');

const glob = util.promisify(globCallback);

// @ts-ignore
const rawModulePaths = Module['_nodeModulePaths'];
const getModulePaths = /** @type {(from: string) => string[]} */ (rawModulePaths);

/**
 * @typedef {import('./typedefs').InterfaceFile} InterfaceFile
 */

/**
 * @param {object} esmResult
 * @param {string} specifier
 */
function guessNamespace(esmResult, specifier) {
  if (specifier.endsWith('.mjs')) return esmResult;

  // "Heuristic" to figure out if it kinda looks like a namespace
  if (
    esmResult !== null &&
    typeof esmResult === 'object' &&
    'default' in esmResult
  )
    return esmResult;

  return { default: esmResult };
}

class Project {
  /**
   * @param {string} appDirectory
   * @param {string} frameworkDirectory
   */
  constructor(appDirectory, frameworkDirectory) {
    this.root = appDirectory;

    const appPath = path.resolve(appDirectory, 'app');
    this.app = new Module('<app>');
    this.app.filename = appPath;
    this.app.paths = getModulePaths(appPath);

    const frameworkPath = path.resolve(frameworkDirectory, 'app');
    this.framework = new Module('<framework>');
    this.framework.filename = frameworkPath;
    this.framework.paths = getModulePaths(frameworkPath);

    this._pkgJson = null;
    this._globCache = {};
    this._globStatCache = {};

    this._importESM = esm(this.app, {
      cjs: {
        cache: false,
        esModule: false,
        extensions: false,
        mutableNamespace: false,
        namedExports: false,
        paths: false,
        vars: false,
        dedefault: false,
        topLevelReturn: false,
      },
      mode: 'strict',
    });
  }

  /**
   * @param {string} pattern
   * @param {object} [options]
   * @returns {string[]}
   */
  cachedGlob(pattern, options = {}) {
    return glob(
      pattern,
      Object.assign(
        {
          cwd: this.root,
          cache: this._globCache,
          statCache: this._globStatCache,
          absolute: true,
        },
        options
      )
    );
  }

  get packageJson() {
    if (this._pkgJson === null) {
      this._pkgJson = this.require('./package.json');
    }
    return this._pkgJson;
  }

  /**
   * @param {string} basename
   */
  async loadInterfaceFiles(basename) {
    const { dependencies = {}, devDependencies = {} } = this.packageJson;
    const isProduction = process.env.NODE_ENV === 'production';
    const deps = Object.keys(dependencies).concat(
      isProduction ? [] : Object.keys(devDependencies)
    );
    debug('loadInterfaceFiles', { basename, isProduction });
    const localFiles = await this.cachedGlob(
      `{modules,lib}/*/${basename}.{js,mjs}`
    );
    const localSpecifiers = localFiles.map(filename => {
      const relativePath = filename.startsWith(`${this.root}/`)
        ? `.${filename.slice(this.root.length)}`
        : filename;
      const group = path.basename(path.dirname(filename));
      return { specifier: relativePath, group };
    });
    const depSpecifiers = deps.map(dep => {
      return {
        specifier: `${dep}/${basename}`,
        group: path.basename(dep),
      };
    });
    const results = await Promise.all(
      [...localSpecifiers, ...depSpecifiers].map(
        async ({ specifier, group }) => {
          const moduleNamespace = /** @type {{ default: any }} */ (await this.importOrNull(
            specifier
          ));
          if (moduleNamespace === null) return null;
          return {
            defaultExport: moduleNamespace.default,
            moduleNamespace,
            specifier,
            group,
          };
        }
      )
    );
    debug('interfaceFiles(%j)', basename, results);

    return /** @type {InterfaceFile[]} */ (results.filter(
      result => result !== null
    ));
  }

  /**
   * @param {string} id
   * @returns {Promise<unknown>}
   */
  import(id) {
    const esmResult = this._importESM(id);
    return guessNamespace(esmResult, id);
  }

  /**
   * @param {string} id
   * @returns {Promise<unknown>}
   */
  async importOrNull(id) {
    try {
      return await this.import(id);
    } catch (e) {
      // Still throw errors unrelated to finding the module
      if (e.code !== 'MODULE_NOT_FOUND') throw e;
      // Do *not* ignore failing requires of subsequent files
      if (!e.message.includes(`'${id}'`)) throw e;

      return null;
    }
  }

  /**
   * @template T
   * @param {string} id
   * @returns {T}
   */
  require(id) {
    return this.app.require(id);
  }

  /**
   * @template T
   * @param {string} id
   * @returns {T | null}
   */
  requireOrNull(id) {
    try {
      return this.require(id);
    } catch (e) {
      // Still throw errors unrelated to finding the module
      if (e.code !== 'MODULE_NOT_FOUND') throw e;
      // Do *not* ignore failing requires of subsequent files
      if (!e.message.includes(`'${id}'`)) throw e;

      return null;
    }
  }

  /**
   * @template T
   * @param {string} id
   * @returns {T}
   */
  requireBundled(id) {
    return this.framework.require(id);
  }

  /**
   * @template T
   * @param {string} id
   * @returns {T}
   */
  requireOrBundled(id) {
    const original = this.requireOrNull(id);
    if (original === null) {
      return this.requireBundled(id);
    }
    return original;
  }
}
module.exports = Project;
