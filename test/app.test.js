'use strict';

const path = require('path');

const assert = require('assert');

const { App } = require('../');

/**
 * @typedef {import('../').MultiValuedProviderNode} MultiValuedProviderNode
 */

const CLI_PATH = path.resolve(__dirname, '..', 'examples', 'cli');
const PROJECT_PATH = path.resolve(__dirname, '..', 'examples', 'project');

describe('app', () => {
  it('exposes project and registry', () => {
    const app = new App(PROJECT_PATH, CLI_PATH);

    assert.strictEqual(app.appDirectory, PROJECT_PATH);
    assert.strictEqual(app.project.packageJson.name, 'nilo-project');
    assert.strictEqual(
      app.project.requireBundled('./package.json').name,
      'nilo-cli'
    );

    const singletonInjector = app.registry.getSingletonInjector();

    assert.strictEqual(singletonInjector.get('app'), app);
    assert.strictEqual(singletonInjector.get('project'), app.project);
    assert.strictEqual(singletonInjector.get('registry'), app.registry);
  });

  describe('inspection of registered dependencies', () => {
    it('includes dependency chain', async () => {
      const app = new App(PROJECT_PATH, CLI_PATH);
      await app.initialize();

      const objectGraph = app.registry.getProviderGraph();
      assert.strictEqual(objectGraph.name, 'singleton');
      assert.strictEqual(objectGraph.children[0].name, 'request');
      assert.strictEqual(objectGraph.children[0].children[0].name, 'action');

      const spoilers = /** @type {MultiValuedProviderNode} */ (objectGraph.providers.get(
        'spoilers'
      ));
      assert.strictEqual(spoilers.key, 'spoilers');
      assert.ok(spoilers.multiValued);
      assert.ok(spoilers.indices instanceof Map);

      assert.strictEqual(spoilers.indices.get('answer').multiValued, false);

      const actionScopeNode = objectGraph.children[0].children[0];
      const answer = actionScopeNode.providers.get('answer');
      assert.deepStrictEqual(answer.dependencies, [
        {
          key: 'base',
          multiValued: false,
          optional: false,
        },
        {
          key: 'factor',
          multiValued: false,
          optional: false,
        },
      ]);
    });
  });

  describe('runAll', () => {
    it('gracefully does nothing if the hook is empty', async () => {
      const app = new App(PROJECT_PATH, CLI_PATH);
      await app.runAll('myHook[]');
    });

    it('runs everything in a multi-valued dependency', async () => {
      const app = new App(PROJECT_PATH, CLI_PATH);

      const expected = ['x', 'y', 'z'];
      const actual = /** @type {string[]} */ ([]);
      for (const index of expected) {
        app.registry.singleton.setFactory(
          `myHook[${index}]`,
          null,
          () => async () => {
            actual.push(index);
          }
        );
      }
      await app.runAll('myHook[]');
      assert.deepStrictEqual(actual, expected);
    });
  });
});
