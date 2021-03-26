'use strict';

const path = require('path');
const console = require('console');

const assert = require('assert');
const sortBy = require('lodash.sortby');
const tmp = require('tmp');

const { Project } = require('../');
const { supportsESM } = require('./env');

const { writeFiles, withNodeEnv } = require('./env');

const FRAMEWORK_DIR = path.resolve(__dirname, '..');

tmp.setGracefulCleanup();
/**
 *
 * @param {string} pkgName
 * @return {{[p: string]: string}}
 */
function getEverywhereJS(pkgName) {
  return {
    [`node_modules/${pkgName}/everywhere.js`]: `\
'use strict';

module.exports = 'from ${pkgName}';
`,
  };
}

/**
 * @param {{ specifier: string, [key: string]: any }[]} actual
 * @param {{ specifier: string, [key: string]: any }[]} expected
 */
function sortedEqual(actual, expected) {
  // native es modules return a namespace which isn't an ordinary object,
  // which makes mocha barf on diffing
  for (const a of actual) {
    if (a.moduleNamespace) a.moduleNamespace = { ...a.moduleNamespace };
  }
  assert.deepStrictEqual(
    sortBy(actual, 'specifier'),
    sortBy(expected, 'specifier')
  );
}

describe('Project', () => {
  /** @type {import('tmp').DirResult} */
  let tmpHandle;
  /** @type {Project} */
  let project;
  let hasESMSupport = false;
  let hasCJSSupport = false;

  before(async () => {
    [hasESMSupport, hasCJSSupport] = await supportsESM();
    console.log(`   [esm support ${hasESMSupport ? 'enabled' : 'disabled'}]`);
    console.log(`   [cjs support ${hasCJSSupport ? 'enabled' : 'disabled'}]`);
  });
  afterEach(() => {
    // @ts-ignore
    project['_globCache'] = {};
    // @ts-ignore
    project['_globStatCache'] = {};
  });

  beforeEach(async () => {
    tmpHandle = tmp.dirSync({ unsafeCleanup: true });
    project = new Project(tmpHandle.name, FRAMEWORK_DIR);
  });

  afterEach(() => {
    if (tmpHandle) tmpHandle.removeCallback();
  });

  describe('CJS handling', () => {
    const cases = {
      '@some-scope/pkg1': {
        files: getEverywhereJS('@some-scope/pkg1'),
        expected: {
          specifier: '@some-scope/pkg1/everywhere',
          group: 'pkg1',
          moduleNamespace: { default: 'from @some-scope/pkg1' },
          defaultExport: 'from @some-scope/pkg1',
        },
      },

      'exports-invalid1': {
        files: {
          'node_modules/exports-invalid1/package.json': {
            exports: {
              '.': './something.js', // ./everywhere exports path is missing
            },
          },
        },
      },
      'exports-dep1': {
        files: {
          'node_modules/exports-dep1/package.json': {
            exports: {
              './everywhere': './everywhere.js', // valid exports path
            },
          },
          ...getEverywhereJS('exports-dep1'),
        },
        expected: {
          defaultExport: 'from exports-dep1',
          group: 'exports-dep1',
          moduleNamespace: {
            default: 'from exports-dep1',
          },
          specifier: 'exports-dep1/everywhere',
        },
      },

      pkg1: {
        expected: {
          specifier: 'exports-dep1/everywhere',
          group: 'exports-dep1',
          moduleNamespace: { default: 'from exports-dep1' },
          defaultExport: 'from exports-dep1',
        },
      },

      lib1: {
        files: {
          'lib/lib1/everywhere.js': `\
'use strict';

module.exports = 'from lib1';
`,
          'modules/lib1/open-graph.js': `\
'use strict';

module.exports = () => {return 'from lib1'};
`,
        },
        expected: {
          specifier: './lib/lib1/everywhere.js',
          group: 'lib1',
          moduleNamespace: { default: 'from lib1' },
          defaultExport: 'from lib1',
        },
      },
      'dev-dep1': {
        files: getEverywhereJS('dev-dep1'),
        expected: {
          specifier: 'dev-dep1/everywhere',
          group: 'dev-dep1',
          moduleNamespace: { default: 'from dev-dep1' },
          defaultExport: 'from dev-dep1',
        },
      },
      unlisted: {
        files: getEverywhereJS('unlisted'),
      },
    };

    beforeEach(async () => {
      // create modules etc.
      const files = {
        'package.json': {
          dependencies: {
            '@some-scope/pkg1': '*',
            pkg1: '*',
            'exports-dep1': '*',
            'exports-invalid1': '*',
          },
          devDependencies: {
            'dev-dep1': '*',
          },
        },
        ...cases['@some-scope/pkg1'].files,
        ...cases['lib1'].files,
        ...cases['exports-dep1'].files,
        ...cases['exports-invalid1'].files,
        ...cases['dev-dep1'].files,
        ...cases['unlisted'].files,
      };

      writeFiles(files, tmpHandle);
    });

    describe('project.loadInterfaceFiles', () => {
      it('returns an empty set if there are no interface files', async () => {
        sortedEqual(await project.loadInterfaceFiles('no-such-files'), []);
      });

      withNodeEnv('production', () => {
        it('omits dev deps', async () => {
          sortedEqual(await project.loadInterfaceFiles('everywhere'), [
            cases['lib1'].expected,
            cases['@some-scope/pkg1'].expected,
            cases['exports-dep1'].expected,
          ]);
        });
      });

      withNodeEnv('any-env', () => {
        it('includes dev deps', async () => {
          sortedEqual(await project.loadInterfaceFiles('everywhere'), [
            cases['lib1'].expected,
            cases['@some-scope/pkg1'].expected,
            cases['dev-dep1'].expected,
            cases['exports-dep1'].expected,
          ]);
        });

        it('omits packages with exports section not exporting requested path', async () => {
          const res = await project.loadInterfaceFiles('everywhere');
          assert.ok(
            res.every(
              ({ defaultExport }) => !defaultExport.includes('exports-invalid1')
            )
          );
        });

        it('omits unlisted / sub-dependencies dependencies', async () => {
          const res = await project.loadInterfaceFiles('everywhere');
          assert.ok(
            res.every(
              ({ defaultExport }) => !defaultExport.includes('unlisted1')
            )
          );
        });
      });
    });

    describe('project.requireOrNull', () => {
      it(`returns file handle for valid module`, async () => {
        assert.strictEqual(
          project.requireOrNull('@some-scope/pkg1/everywhere'),
          'from @some-scope/pkg1'
        );
      });

      it(`doesn't throw when require throws ERR_PACKAGE_PATH_NOT_EXPORTED`, async function () {
        if (!hasESMSupport) {
          this.skip();
        }

        assert.doesNotThrow(() => {
          const res = project.requireOrNull('exports-invalid1/everywhere');
          assert.strictEqual(res, null);
        });
      });

      it(`doesn't throw when require throws MODULE_NOT_FOUND`, async () => {
        assert.doesNotThrow(() => {
          const res = project.requireOrNull('@some-scope/pkg1/something');
          assert.strictEqual(res, null);
        });
      });
    });

    describe('project.requireOrBundled', () => {
      it(`returns file handle for valid module`, async () => {
        assert.strictEqual(
          project.requireOrBundled('@some-scope/pkg1/everywhere'),
          'from @some-scope/pkg1'
        );
      });

      it(`will throw when files don't exist`, async () => {
        ['exports-invalid1/everywhere', '@some-scope/pkg1/something'].forEach(
          file => {
            if (file.includes('exports-invalid1') && !hasESMSupport) {
              return;
            }
            assert.throws(
              () => project.requireOrBundled(file),
              /Cannot find module/
            );
          }
        );
      });
    });

    describe('project.import', () => {
      it(`returns file handle for valid module`, async () => {
        assert.deepStrictEqual(
          await project.import('@some-scope/pkg1/everywhere'),
          { default: 'from @some-scope/pkg1' }
        );
      });

      it(`doesn't throw when "import" throws ERR_PACKAGE_PATH_NOT_EXPORTED`, async function () {
        if (!hasESMSupport) {
          this.skip();
        }

        assert.doesNotThrow(async () => {
          const res = await project.import('exports-invalid1/everywhere');

          assert.strictEqual(res, null);
        });
      });

      it(`doesn't throw when "import" can't find module`, async () => {
        assert.doesNotThrow(async () => {
          const res = await project.import('@some-scope/pkg1/something');
          assert.strictEqual(res, null);
        });
      });
    });
  });

  describe('ESM handling', () => {
    const mjs_cases = {
      default_local: {
        files: {
          './modules/default_local/everywhere.mjs': `\
export default 'from default_local';
`,
        },
        expected: {
          specifier: './modules/default_local/everywhere.mjs',
          group: 'default_local',
          moduleNamespace: {
            default: 'from default_local',
          },
          defaultExport: 'from default_local',
        },
      },

      no_default_local: {
        files: {
          './modules/no_default_local/everywhere.mjs': `\
export const namedExport = 'forwarded';
`,
        },
        expected: {
          specifier: './modules/no_default_local/everywhere.mjs',
          group: 'no_default_local',
          moduleNamespace: {
            namedExport: 'forwarded',
          },
          defaultExport: undefined,
        },
      },

      es_module_local: {
        files: {
          './modules/es_module_local/everywhere.js': `\
export const namedExport = 'forwarded';
export default 'from default_local';
`,
        },
        expected: {
          specifier: './modules/es_module_local/everywhere.js',
          group: 'es_module_local',
          moduleNamespace: {
            namedExport: 'forwarded',
            default: 'from default_local',
          },
          defaultExport: 'from default_local',
        },
      },

      npm_exports: {
        FIXME: 'not working yet',
        files: {
          './node_modules/npm_exports/package.json': {
            name: 'npm_exports',
            exports: {
              '.': './everywhere.mjs',
              './everywhere': './everywhere.mjs',
            },
          },
          './node_modules/npm_exports/everywhere.mjs': `\
      export const namedExport = 'forwarded';
      `,
        },
        expected: {
          specifier: './node_modules/npm_exports/everywhere.mjs',
          group: 'npm_exports',
          moduleNamespace: {
            namedExport: 'forwarded',
          },
          defaultExport: undefined,
        },
      },

      npm_type_module: {
        FIXME: 'not working yet',
        files: {
          './node_modules/npm_type_module/package.json': { type: 'module' },
          './node_modules/npm_type_module/everywhere.js': `\
      export const namedExport = 'forwarded';
      `,
        },
        expected: {
          specifier: './node_modules/npm_type_module/everywhere.js',
          group: 'npm_type_module',
          moduleNamespace: {
            namedExport: 'forwarded',
          },
          defaultExport: undefined,
        },
      },

      cjs_module_local: {
        FIXME: 'not working yet',
        files: {
          'lib/cjs_module_local/everywhere.cjs': `\
'use strict';

module.exports = 'from cjs_module_local';
`,
        },
        expected: {
          specifier: './lib/cjs_module_local/everywhere.cjs',
          group: 'cjs_module_local',
          moduleNamespace: { default: 'from cjs_module_local' },
          defaultExport: 'from cjs_module_local',
        },
      },
    };

    describe('local', () => {
      it('loads local ESM files', async function () {
        if (!hasESMSupport) {
          console.log('ESM not supported. Skipping test');
          this.skip();
        }

        const files = {
          'package.json': {
            type: 'modules',
            dependencies: {
              npm_exports: '*',
            },
            devDependencies: {},
          },
          './modules/package.json': {
            type: 'modules',
          },
          ...mjs_cases['default_local'].files,
          ...mjs_cases['no_default_local'].files,
        };

        writeFiles(files, tmpHandle);

        sortedEqual(await project.loadInterfaceFiles('everywhere'), [
          mjs_cases['default_local'].expected,
          mjs_cases['no_default_local'].expected,
        ]);
      });

      // this fails in Node 10 / legacy ESM implementation
      // right now the globbing pattern in `lib/project.js` doesn't include cjs
      it.skip('loads local ESM files w/ project type=module', async function () {
        if (!hasESMSupport) {
          console.log('ESM not supported. Skipping test');
          this.skip();
        }

        const files = {
          'package.json': { type: 'module' },
          ...mjs_cases['es_module_local'].files,
          ...(hasCJSSupport && mjs_cases['cjs_module_local'].files),
        };

        writeFiles(files, tmpHandle);

        sortedEqual(await project.loadInterfaceFiles('everywhere'), [
          mjs_cases['es_module_local'].expected,
          ...(hasCJSSupport ? [mjs_cases['cjs_module_local'].expected] : []),
        ]);
      });
    });
  });
});
