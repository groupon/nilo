'use strict';

const fs = require('fs');
const path = require('path');

const assert = require('chai').assert;
const sortBy = require('lodash/sortBy');
const mkdirp = require('mkdirp');
const tmp = require('tmp');

const { Project } = require('../');
const { supportsESM } = require('../lib/esm');

const FRAMEWORK_DIR = path.resolve(__dirname, '..');

/**
 * @param {string} nodeEnv
 * @param {() => void} fn
 */
function withNodeEnv(nodeEnv, fn) {
  describe(`with NODE_ENV=${nodeEnv}`, () => {
    before(() => {
      process.env.NODE_ENV = nodeEnv;
    });
    after(() => {
      process.env.NODE_ENV = 'test';
    });
    fn();
  });
}

describe('Project', () => {
  describe('loadInterfaceFiles', () => {
    /** @type {Project} */
    let project;
    /** @type {import('tmp').SynchrounousResult} */
    let tmpHandle;
    before(async () => {
      tmpHandle = tmp.dirSync({ unsafeCleanup: true });
      project = new Project(tmpHandle.name, FRAMEWORK_DIR);

      // create modules etc.
      /** @type {{ [key: string]: string | object }} */
      const files = {
        'package.json': {
          dependencies: {
            '@some-scope/pkg1': '*',
            pkg1: '*',
          },
          devDependencies: {
            'dev-dep1': '*',
          },
        },
        'lib/lib1/everywhere.js': `\
'use strict';

module.exports = 'from lib1';
`,
      };
      if (await supportsESM()) {
        files['modules/mod1/everywhere.mjs'] = `\
export default 'from mod1';
export const namedExport = 'forwarded';
`;
      }
      const pkgNames = ['@some-scope/pkg1', 'dev-dep1', 'hoisted', 'pkg2'];
      for (const pkgName of pkgNames) {
        files[`node_modules/${pkgName}/everywhere.js`] = `\
'use strict';

module.exports = 'from ${pkgName}';
`;
      }

      for (const [filename, content] of Object.entries(files)) {
        const absoluteFilename = path.join(tmpHandle.name, filename);
        mkdirp.sync(path.dirname(absoluteFilename));
        fs.writeFileSync(
          absoluteFilename,
          typeof content === 'string' ? content : `${JSON.stringify(content)}\n`
        );
      }
    });

    after(() => {
      if (tmpHandle) tmpHandle.removeCallback();
    });

    afterEach(() => {
      // @ts-ignore
      project['_globCache'] = {};
      // @ts-ignore
      project['_globStatCache'] = {};
    });

    /**
     * @param {{ specifier: string, [key: string]: any }[]} expected
     * @param {{ specifier: string, [key: string]: any }[]} actual
     */
    function sortedEqual(expected, actual) {
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

    it('returns an empty set if there are no interface files', async () => {
      sortedEqual([], await project.loadInterfaceFiles('no-such-files'));
    });

    withNodeEnv('production', () => {
      it('omits dev deps', async () => {
        sortedEqual(
          [
            {
              specifier: './lib/lib1/everywhere.js',
              group: 'lib1',
              moduleNamespace: { default: 'from lib1' },
              defaultExport: 'from lib1',
            },
            ...((await supportsESM())
              ? [
                  {
                    specifier: './modules/mod1/everywhere.mjs',
                    group: 'mod1',
                    moduleNamespace: {
                      default: 'from mod1',
                      namedExport: 'forwarded',
                    },
                    defaultExport: 'from mod1',
                  },
                ]
              : []),
            {
              specifier: '@some-scope/pkg1/everywhere',
              group: 'pkg1',
              moduleNamespace: { default: 'from @some-scope/pkg1' },
              defaultExport: 'from @some-scope/pkg1',
            },
          ],
          await project.loadInterfaceFiles('everywhere')
        );
      });
    });

    withNodeEnv('foobar', () => {
      it('includes dev deps', async () => {
        sortedEqual(
          [
            {
              specifier: './lib/lib1/everywhere.js',
              group: 'lib1',
              moduleNamespace: { default: 'from lib1' },
              defaultExport: 'from lib1',
            },
            ...((await supportsESM())
              ? [
                  {
                    specifier: './modules/mod1/everywhere.mjs',
                    group: 'mod1',
                    moduleNamespace: {
                      default: 'from mod1',
                      namedExport: 'forwarded',
                    },
                    defaultExport: 'from mod1',
                  },
                ]
              : []),
            {
              specifier: '@some-scope/pkg1/everywhere',
              group: 'pkg1',
              moduleNamespace: { default: 'from @some-scope/pkg1' },
              defaultExport: 'from @some-scope/pkg1',
            },
            {
              specifier: 'dev-dep1/everywhere',
              group: 'dev-dep1',
              moduleNamespace: { default: 'from dev-dep1' },
              defaultExport: 'from dev-dep1',
            },
          ],
          await project.loadInterfaceFiles('everywhere')
        );
      });
    });
  });
});
