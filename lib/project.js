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

const debug = require('debug')('nilo:project');

const Module = require('module');
const path = require('path');
const util = require('util');
const { URL } = require('url');

const semver = require('semver');
const globCallback = require('glob');

const glob = util.promisify(globCallback);

/* @ts-ignore */
// eslint-disable-next-line node/no-deprecated-api
const { createRequireFromPath } = Module;
// eslint-disable-next-line node/no-unsupported-features/node-builtins
const { createRequire } = Module;

// createRequireFromPath is deprecated Node 10.x; createRequire is official 12+
/** @type {typeof createRequireFromPath} */
const createReq = createRequire || createRequireFromPath;

const { importESM } = require('./esm');

/**
 * @typedef {import('./typedefs').InterfaceFile} InterfaceFile
 * @typedef {import('./typedefs').PackageJSON} PackageJSON
 */

/**
 * @param {string} reSTR
 */
function escapeRE(reSTR) {
  return reSTR.replace(/[$^*()+\[\]{}\\|.?]/g, '\\$&');
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isLocalRef(id) {
  return /^(\.\.?)?\//.test(id);
}

/**
 * @param {string} id
 * @param {string} cwd
 * @returns {string}
 */
function directRequire(id, cwd) {
  if (!path.extname(id)) {
    id = `${id}.js`;
  }
  id = path.join(cwd, !isLocalRef(id) ? 'node_modules' : '', id);

  // eslint-disable-next-line import/no-dynamic-require
  return require(id);
}

/**
 * @param {boolean} isModule
 * @returns {string[]}
 */
function getExtensions(isModule) {
  if (!isModule) {
    return ['mjs', 'js'];
  }
  return semver.satisfies(process.versions.node, '>=12.18.0')
    ? ['js', 'cjs']
    : ['js'];
}

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
    return glob(pattern, {
      cwd: this.root,
      cache: this._globCache,
      statCache: this._globStatCache,
      absolute: true,
      ...options,
    });
  }

  get packageJson() {
    if (this._pkgJson === null) {
      this._pkgJson = this.require('./package.json');
    }
    return this._pkgJson;
  }

  /**
   * @param {string[]} deps
   * @returns {Promise<boolean[]>}
   */
  async checkModules(deps) {
    const pkgs = await Promise.all(
      deps.map(dep => this.requireOrNull(path.join(dep, 'package.json')))
    );

    return pkgs.map(
      /** @type {PackageJSON|null} */ pkg => !!(pkg && pkg.type === 'module')
    );
  }

  /**
   * @param {string} basename
   * @returns {Promise<{specifier: string, group: string, isModule: boolean}[]>}
   * @private
   */
  async _getLocalTargets(basename) {
    const extension = path.extname(basename);
    const isModule = this.packageJson.type === 'module';
    const patterns = `.{${getExtensions(isModule).join()}}`;

    const localFiles = await this.cachedGlob(
      `{modules,lib}/*/${basename}${!extension ? patterns : ''}`
    );

    return localFiles.map(filename => {
      const relativePath = filename.startsWith(`${this.root}/`)
        ? `.${filename.slice(this.root.length)}`
        : filename;
      const group = path.basename(path.dirname(filename));
      return { specifier: relativePath, group, isModule };
    });
  }

  /**
   * @param {string} basename
   * @param {string[]} deps
   * @returns {Promise<{specifier: string, group: string, isModule: boolean}[]>}
   * @private
   */
  async _getPackageTargets(basename, deps) {
    const isModuleArr = await this.checkModules(deps);
    return deps.map((dep, i) => {
      return {
        specifier: `${dep}/${basename}`,
        group: path.basename(dep),
        isModule: isModuleArr[i],
      };
    });
  }

  /**
   * @param {string} basename
   * @returns {Promise<InterfaceFile[]>}
   */
  async loadInterfaceFiles(basename) {
    const { dependencies = {}, devDependencies = {} } = this.packageJson;
    const isProduction = process.env.NODE_ENV === 'production';
    const deps = [
      ...Object.keys(dependencies),
      ...(isProduction ? [] : Object.keys(devDependencies)),
    ];
    debug('loadInterfaceFiles', { basename, isProduction });

    const localSpecifiers = await this._getLocalTargets(basename);

    const depSpecifiers = await this._getPackageTargets(basename, deps);

    const allSpecifiers = [...localSpecifiers, ...depSpecifiers];

    /** @type {({default: *}|{default: string}|null|undefined)[]} */
    const moduleNamespaces = await Promise.all(
      allSpecifiers.map(async ({ specifier, isModule }) => {
        const hasExtension = !!path.extname(specifier);

        if (!hasExtension) {
          const extensions = getExtensions(isModule);
          let res;
          for (const ext of extensions) {
            res = await this.importOrNull(`${specifier}.${ext}`);
            if (res !== null) {
              break;
            }
          }
          return res;
        } else {
          return this.importOrNull(specifier);
        }
      })
    );

    const results = allSpecifiers
      .map(({ specifier, group }, i) => {
        const moduleNamespace = moduleNamespaces[i];
        if (moduleNamespace != null) {
          return {
            defaultExport: moduleNamespace.default,
            moduleNamespace,
            specifier,
            group,
          };
        }
        return null;
      })
      .filter(result => result !== null);

    debug('interfaceFiles(%j)', basename, results);

    return /** @type {InterfaceFile[]} */ (results);
  }

  /**
   * @param {string} id
   * @returns {Promise<{default: *}|{default: string}>}
   */
  async import(id) {
    debug('import', id);

    try {
      if (!isLocalRef(id)) {
        return { default: this.require(id) };
      }
    } catch (e) {
      // handle ERR_PACKAGE_PATH_NOT_EXPORTED for modules with "exports" section (Node 13/14+)
      if (e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
        try {
          return { default: directRequire(id, this.root) };
        } catch (err) {
          // eslint-disable-next-line no-ex-assign
          e = err;
        }
      }

      if (e.code !== 'ERR_REQUIRE_ESM') {
        throw e;
      }
    }

    // handle ERR_REQUIRE_ESM
    try {
      const esmPath = new URL(
        id,
        `file://${this.root}/${isLocalRef(id) ? 'app' : 'node_modules/'}`
      ).toString();

      // import via native import()
      const esm = await importESM(esmPath);

      if (util.types.isModuleNamespaceObject(esm)) {
        return esm;
      }
    } catch (err) {
      if (err.message !== 'Not supported') {
        throw err;
      }
    }

    return { default: this.require(id) };
  }

  /**
   * @param {string} id
   * @returns {Promise<null|{default: *}|{default: string}>}
   */
  async importOrNull(id) {
    try {
      return await this.import(id);
    } catch (e) {
      // Still throw errors unrelated to finding the module
      if (e.code !== 'MODULE_NOT_FOUND') {
        throw e;
      }
      // Do *not* ignore failing requires of subsequent files
      const re = new RegExp(`([\\s'"])?${escapeRE(id)}([\\s'"])?`);
      if (!re.test(e.message)) {
        throw e;
      }

      return null;
    }
  }

  /**
   * @template T
   * @param {string} id
   * @returns {any}
   */
  requireOrNull(id) {
    try {
      return this.require(id);
    } catch (e) {
      if (e.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
        try {
          return directRequire(id, this.root);
        } catch (err) {
          // eslint-disable-next-line no-ex-assign
          e = err;
        }
      }

      // Still throw errors unrelated to finding the module
      if (e.code !== 'MODULE_NOT_FOUND') {
        throw e;
      }
      // Do *not* ignore failing requires of subsequent files
      if (!e.message.includes(id)) {
        throw e;
      }

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
