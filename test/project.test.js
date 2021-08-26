'use strict';

const path = require('path');
const console = require('console');

const assert = require('assert');
const sortBy = require('lodash.sortby');
const tmp = require('tmp');

const { Project } = require('../');
const { supportsESM } = require('./env');

const { writeFiles } = require('./env');

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
          ...getEverywhereJS('exports-invalid1'),
          'node_modules/exports-invalid1/package.json': {
            exports: {
              '.': './something.js', // ./everywhere exports path is missing
            },
          },
        },
        expected: {
          defaultExport: 'from exports-invalid1',
          group: 'exports-invalid1',
          moduleNamespace: {
            default: 'from exports-invalid1',
          },
          specifier: 'exports-invalid1/everywhere',
        },
      },
      'exports-dep1': {
        files: {
          ...getEverywhereJS('exports-dep1'),
          'node_modules/exports-dep1/package.json': {
            exports: {
              './everywhere': './everywhere.js', // valid exports path
            },
          },
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

    describe('project.loadInterfaceFiles()', () => {
      it('returns an empty set if there are no interface files', async () => {
        sortedEqual(await project.loadInterfaceFiles('no-such-files'), []);
      });

      describe('with process.env.NODE_ENV=production', () => {
        before(() => {
          process.env.NODE_ENV = 'production';
        });
        after(() => {
          process.env.NODE_ENV = 'test';
        });

        it('omits dev deps', async () => {
          sortedEqual(await project.loadInterfaceFiles('everywhere'), [
            cases['lib1'].expected,
            cases['@some-scope/pkg1'].expected,
            cases['exports-dep1'].expected,
            cases['exports-invalid1'].expected,
          ]);
        });
      });

      describe('with process.env.NODE_ENV=development', () => {
        before(() => {
          process.env.NODE_ENV = 'development';
        });
        after(() => {
          process.env.NODE_ENV = 'test';
        });

        it('includes dev deps', async () => {
          sortedEqual(await project.loadInterfaceFiles('everywhere'), [
            cases['lib1'].expected,
            cases['@some-scope/pkg1'].expected,
            cases['dev-dep1'].expected,
            cases['exports-dep1'].expected,
            cases['exports-invalid1'].expected,
          ]);
        });

        it('is able to load packages with exports section not exporting requested path', async () => {
          const res = await project.loadInterfaceFiles('everywhere');
          assert.ok(
            res.find(({ defaultExport }) =>
              defaultExport.includes('exports-invalid1')
            )
          );
        });

        it(`doesn't throw when import throws ERR_PACKAGE_PATH_NOT_EXPORTED and module.require throws MODULE_NOT_FOUND`, async function () {
          if (!hasESMSupport) {
            this.skip();
          }

          await assert.doesNotReject(() =>
            project.loadInterfaceFiles('exports-invalid1/missing')
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

    describe('project.requireOrNull()', () => {
      it(`returns file handle for valid module`, async () => {
        assert.strictEqual(
          project.requireOrNull('@some-scope/pkg1/everywhere'),
          'from @some-scope/pkg1'
        );
      });

      it(`falls back to direct module.require when ERR_PACKAGE_PATH_NOT_EXPORTED occurs`, async function () {
        if (!hasESMSupport) {
          this.skip();
        }

        const res = project.requireOrNull('exports-invalid1/everywhere');
        assert.strictEqual(res, 'from exports-invalid1');
      });

      it(`doesn't throw when require throws ERR_PACKAGE_PATH_NOT_EXPORTED and module.require throws MODULE_NOT_FOUND`, async function () {
        if (!hasESMSupport) {
          this.skip();
        }

        assert.doesNotThrow(() => {
          const res = project.requireOrNull('exports-invalid1/missing');
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

    describe('project.requireOrBundled()', () => {
      it(`returns file handle for valid module`, async () => {
        assert.strictEqual(
          project.requireOrBundled('@some-scope/pkg1/everywhere'),
          'from @some-scope/pkg1'
        );
      });

      it(`will throw when files don't exist`, async () => {
        ['exports-invalid1/missing', '@some-scope/pkg1/something'].forEach(
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

    describe('project.import()', () => {
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
    before(function () {
      if (!hasCJSSupport) {
        console.log(
          'Test will likely throw a Segmentation fault (core dumped) in Node 10. Skipping tests.'
        );
        this.skip();
      }
    });

    describe('local files', () => {
      const cases = {
        mjs_default_local: {
          files: {
            './modules/mjs_default_local/everywhere.mjs': `\
export default 'from mjs_default_local';
`,
          },
          expected: {
            specifier: './modules/mjs_default_local/everywhere.mjs',
            group: 'mjs_default_local',
            moduleNamespace: {
              default: 'from mjs_default_local',
            },
            defaultExport: 'from mjs_default_local',
          },
        },

        mjs_named_local: {
          files: {
            './modules/mjs_named_local/everywhere.mjs': `\
export const namedExport = 'forwarded';
`,
          },
          expected: {
            specifier: './modules/mjs_named_local/everywhere.mjs',
            group: 'mjs_named_local',
            moduleNamespace: {
              namedExport: 'forwarded',
            },
            defaultExport: undefined,
          },
        },

        esm_mixed_local: {
          files: {
            './modules/esm_mixed_local/everywhere.js': `\
export const namedExport = 'forwarded';
export default 'from esm_mixed_local';
`,
          },
          expected: {
            specifier: './modules/esm_mixed_local/everywhere.js',
            group: 'esm_mixed_local',
            moduleNamespace: {
              namedExport: 'forwarded',
              default: 'from esm_mixed_local',
            },
            defaultExport: 'from esm_mixed_local',
          },
        },

        cjs_module_local: {
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

      it('loads mjs', async () => {
        const files = {
          'package.json': {
            type: 'modules',
            dependencies: {
              npm_exports: '*',
            },
            devDependencies: {},
          },
          ...cases['mjs_default_local'].files,
          ...cases['mjs_named_local'].files,
        };

        writeFiles(files, tmpHandle);

        sortedEqual(await project.loadInterfaceFiles('everywhere'), [
          cases['mjs_default_local'].expected,
          cases['mjs_named_local'].expected,
        ]);
      });

      it('loads js and cjs w/ project type=module ', async () => {
        const files = {
          'package.json': { type: 'module' },
          ...cases['esm_mixed_local'].files,
          ...(hasCJSSupport && cases['cjs_module_local'].files),
        };

        writeFiles(files, tmpHandle);

        sortedEqual(await project.loadInterfaceFiles('everywhere'), [
          cases['esm_mixed_local'].expected,
          ...(hasCJSSupport ? [cases['cjs_module_local'].expected] : []),
        ]);
      });
    });

    describe('from package', () => {
      describe('type=commonjs', () => {
        const cases = {
          mjs: {
            files: {
              './node_modules/mjs/package.json': {},
              './node_modules/mjs/everywhere.mjs': `\
      export const namedExport = 'forwarded';
      `,
              './node_modules/mjs/everywhere.js': `\
      exports.namedExport = 'forwarded';
      `,
            },
            expected: {
              specifier: 'mjs/everywhere',
              group: 'mjs',
              moduleNamespace: {
                namedExport: 'forwarded',
              },
              defaultExport: undefined,
            },
          },
          mjs_with_exports: {
            files: {
              './node_modules/mjs_with_exports/package.json': {
                exports: {
                  './everywhere': './everywhere.mjs',
                },
              },
              './node_modules/mjs_with_exports/everywhere.mjs': `\
      export const namedExport = 'forwarded';
      `,
              './node_modules/mjs_with_exports/everywhere.js': `\
      exports.namedExport = 'forwarded';
      `,
            },
            expected: {
              specifier: 'mjs_with_exports/everywhere',
              group: 'mjs_with_exports',
              moduleNamespace: {
                namedExport: 'forwarded',
              },
              defaultExport: undefined,
            },
          },
          mjs_with_invalid_exports: {
            files: {
              './node_modules/mjs_with_invalid_exports/package.json': {
                exports: {
                  './nowhere': './nowhere.mjs',
                },
              },
              './node_modules/mjs_with_invalid_exports/everywhere.mjs': `\
      export const namedExport = 'forwarded';
      `,
              './node_modules/mjs_with_invalid_exports/everywhere.js': `\
      exports.namedExport = 'forwarded';
      `,
            },
            expected: {
              specifier: 'mjs_with_invalid_exports/everywhere',
              group: 'mjs_with_invalid_exports',
              moduleNamespace: {
                namedExport: 'forwarded',
              },
              defaultExport: undefined,
            },
          },
        };

        beforeEach(() => {
          const files = {
            'package.json': {
              dependencies: {
                mjs: '*',
                mjs_with_exports: '*',
                mjs_with_invalid_exports: '*',
              },
              devDependencies: {},
            },
            ...cases['mjs'].files,
            ...cases['mjs_with_exports'].files,
            ...cases['mjs_with_invalid_exports'].files,
          };

          writeFiles(files, tmpHandle);
        });

        it('loads mjs with general file request', async () => {
          const expected = [
            cases['mjs'].expected,
            cases['mjs_with_exports'].expected,
            cases['mjs_with_invalid_exports'].expected,
          ];

          const res = await project.loadInterfaceFiles('everywhere');
          sortedEqual(res, expected);
        });

        it('loads mjs with explicit file request', async () => {
          const rawExpected = [
            cases['mjs'].expected,
            cases['mjs_with_exports'].expected,
            cases['mjs_with_invalid_exports'].expected,
          ];

          for (const ext of ['mjs', 'js']) {
            const expected = [...rawExpected].map(item => {
              item = { ...item };
              item.specifier = `${item.specifier}.${ext}`;
              if (ext === 'js') {
                item.defaultExport = { namedExport: 'forwarded' };
                item.moduleNamespace = { default: item.moduleNamespace };
              }
              return item;
            });

            const res = await project.loadInterfaceFiles(`everywhere.${ext}`);
            sortedEqual(res, expected);
          }
        });
      });

      describe('type=module', () => {
        const cases = {
          esm: {
            files: {
              './node_modules/esm/package.json': { type: 'module' },
              './node_modules/esm/everywhere.js': `\
      export const namedExport = 'forwarded';
      `,
              './node_modules/esm/everywhere.cjs': `\
      exports.namedExport = 'forwarded';
      `,
            },
            expected: {
              specifier: 'esm/everywhere',
              group: 'esm',
              moduleNamespace: {
                namedExport: 'forwarded',
              },
              defaultExport: undefined,
            },
          },
          esm_with_export: {
            files: {
              './node_modules/esm_with_export/package.json': {
                type: 'module',
                exports: {
                  './everywhere': {
                    import: './everywhere.js',
                    require: './everywhere.cjs',
                  },
                },
              },
              './node_modules/esm_with_export/everywhere.js': `\
      export const namedExport = 'forwarded';
      `,
              './node_modules/esm_with_export/everywhere.cjs': `\
      exports.namedExport = 'forwarded';
      `,
            },
            expected: {
              specifier: 'esm_with_export/everywhere',
              group: 'esm_with_export',
              moduleNamespace: {
                namedExport: 'forwarded',
              },
              defaultExport: undefined,
            },
          },
          esm_with_invalid_export: {
            files: {
              './node_modules/esm_with_invalid_export/package.json': {
                type: 'module',
                exports: {
                  './nowhere': './nowhere.js',
                },
              },
              './node_modules/esm_with_invalid_export/everywhere.js': `\
      export const namedExport = 'forwarded';
      `,
              './node_modules/esm_with_invalid_export/everywhere.cjs': `\
      exports.namedExport = 'forwarded';
      `,
            },
            expected: {
              specifier: 'esm_with_invalid_export/everywhere',
              group: 'esm_with_invalid_export',
              moduleNamespace: {
                namedExport: 'forwarded',
              },
              defaultExport: undefined,
            },
          },
        };

        beforeEach(() => {
          const files = {
            'package.json': {
              type: 'module',
              dependencies: {
                esm: '*',
                esm_with_export: '*',
                esm_with_invalid_export: '*',
              },
            },
            ...cases['esm'].files,
            ...cases['esm_with_export'].files,
            ...cases['esm_with_invalid_export'].files,
          };

          writeFiles(files, tmpHandle);
        });

        it('loads js and cjs', async () => {
          const expected = [
            cases['esm'].expected,
            cases['esm_with_export'].expected,
            cases['esm_with_invalid_export'].expected,
          ];
          const res = await project.loadInterfaceFiles('everywhere');

          sortedEqual(res, expected);
        });

        it('loads js and cjs with explicit file request', async () => {
          const rawExpected = [
            cases['esm'].expected,
            cases['esm_with_export'].expected,
            cases['esm_with_invalid_export'].expected,
          ];

          for (const ext of ['js', 'cjs']) {
            const expected = [...rawExpected].map(item => {
              item = { ...item };
              item.specifier = `${item.specifier}.${ext}`;
              if (ext === 'cjs') {
                item.defaultExport = { namedExport: 'forwarded' };
                item.moduleNamespace = { default: item.moduleNamespace };
              }
              return item;
            });

            const res = await project.loadInterfaceFiles(`everywhere.${ext}`);
            sortedEqual(res, expected);
          }
        });
      });
    });
  });
});
