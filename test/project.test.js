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
 *
 * @param {string} pkgName
 * @return {{[p: string]: string}}
 */
function getEveryWhereCjs(pkgName) {
  return {
    [`node_modules/${pkgName}/everywhere.js`]: `\
'use strict';

module.exports = 'from ${pkgName}';
`,
  };
}

const cases = {
  '@some-scope/pkg1': {
    files: getEveryWhereCjs('@some-scope/pkg1'),
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
      ...getEveryWhereCjs('exports-dep1'),
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

  mod1: {
    files: {
      'modules/mod1/everywhere.mjs': `\
export default 'from mod1';
export const namedExport = 'forwarded';
`,
    },
    expected: {
      specifier: './modules/mod1/everywhere.mjs',
      group: 'mod1',
      moduleNamespace: {
        default: 'from mod1',
        namedExport: 'forwarded',
      },
      defaultExport: 'from mod1',
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
    files: getEveryWhereCjs('dev-dep1'),
    expected: {
      specifier: 'dev-dep1/everywhere',
      group: 'dev-dep1',
      moduleNamespace: { default: 'from dev-dep1' },
      defaultExport: 'from dev-dep1',
    },
  },
  unlisted: {
    files: getEveryWhereCjs('unlisted'),
  },
};

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
    /** @type {import('tmp').DirResult} */
    let tmpHandle;
    let hasESMSupport = false;

    before(async () => {
      tmpHandle = tmp.dirSync({ unsafeCleanup: true });
      project = new Project(tmpHandle.name, FRAMEWORK_DIR);
      hasESMSupport = await supportsESM();

      // eslint-disable-next-line no-console
      hasESMSupport && console.log('      [esm support enabled]');
      // create modules etc.
      /** @type {{ [key: string]: string | object }} */
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
        ...(hasESMSupport && cases['mod1'].files),
        ...cases['unlisted'].files,
      };

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
        // eslint-disable-next-line no-console
        sortedEqual(
          [
            cases['lib1'].expected,
            ...(hasESMSupport ? [cases['mod1'].expected] : []),
            cases['@some-scope/pkg1'].expected,
            cases['exports-dep1'].expected,
          ],
          await project.loadInterfaceFiles('everywhere')
        );
      });
    });

    withNodeEnv('any-env', () => {
      it('includes dev deps', async () => {
        sortedEqual(
          [
            cases['lib1'].expected,
            ...(hasESMSupport ? [cases['mod1'].expected] : []),
            cases['@some-scope/pkg1'].expected,
            cases['dev-dep1'].expected,
            cases['exports-dep1'].expected,
          ],
          await project.loadInterfaceFiles('everywhere')
        );
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
          res.every(({ defaultExport }) => !defaultExport.includes('unlisted1'))
        );
      });
    });
  });
});
