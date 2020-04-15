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
// @ts-ignore
// eslint-disable-next-line node/no-unsupported-features/node-builtins
const { createRequireFromPath, createRequire } = require('module');
const util = require('util');
const { URL } = require('url');

const debug = require('debug')('nilo:project');
// @ts-ignore
const globCallback = require('glob');

const glob = util.promisify(globCallback);

// createRequireFromPath is deprecated Node 10.x; createRequire is official 12+
/** @type {typeof createRequireFromPath} */
const createReq = createRequire || createRequireFromPath;

const { importESM } = require('./esm');

/**
 * @param {string} reSTR
 */
function escapeRE(reSTR) {
  return reSTR.replace(/[$^*()+\[\]{}\\|.?]/g, '\\$&');
}

/**
 * @typedef {import('./typedefs').InterfaceFile} InterfaceFile
 */

class Project {
  /**
   * @param {string} appDirectory
   * @param {string} frameworkDirectory
   */
  constructor(appDirectory, frameworkDirectory) {
    this.root = appDirectory;

    const appPath = path.resolve(appDirectory, 'app');
    this.require = createReq(appPath);

    const frameworkPath = path.resolve(frameworkDirectory, 'app');
    this.requireBundled = createReq(frameworkPath);

    this._pkgJson = null;
    this._globCache = {};
    this._globStatCache = {};
  }

  /**
   * @param {string} pattern
   * @param {object} [options]
   * @returns {Promise<string[]>}
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
  async import(id) {
    debug('import', id);
    // if it's a package spec, assume we can't load it as a ES module
    // for now
    if (!/^(\.\.?)?\//.test(id)) return { default: this.require(id) };

    try {
      return await importESM(
        /^\.\.?\//.test(id)
          ? new URL(id, `file://${this.root}/app`).toString()
          : id
      );
    } catch (err) {
      if (err.message !== 'Not supported') throw err;
      return { default: this.require(id) };
    }
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
      const re = new RegExp(`(^|[\\s'"])${escapeRE(id)}([\\s'"]|$)`);
      if (!re.test(e.message)) throw e;

      return null;
    }
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
  requireOrBundled(id) {
    const original = this.requireOrNull(id);
    if (original === null) {
      return this.requireBundled(id);
    }
    return original;
  }
}
module.exports = /** @type {typeof import('./typedefs').Project} */ (Project);
