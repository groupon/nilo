'use strict';

const path = require('path');

const { expect } = require('chai');

const { App } = require('../');

/**
 * @typedef {import('../').MultiValuedProviderNode} MultiValuedProviderNode
 */

const CLI_PATH = path.resolve(__dirname, '..', 'examples', 'cli');
const PROJECT_PATH = path.resolve(__dirname, '..', 'examples', 'project');

describe('app', () => {
  it('exposes project and registry', () => {
    const app = new App(PROJECT_PATH, CLI_PATH);
    expect(app.appDirectory).equal(PROJECT_PATH);
    expect(app.project.packageJson.name).equal('nilo-project');
    expect(app.project.requireBundled('./package.json').name).equal('nilo-cli');

    const singletonInjector = app.registry.getSingletonInjector();
    expect(singletonInjector.get('app')).equal(app);
    expect(singletonInjector.get('project')).equal(app.project);
    expect(singletonInjector.get('registry')).equal(app.registry);
  });

  describe('inspection of registered dependencies', () => {
    it('includes dependency chain', async () => {
      const app = new App(PROJECT_PATH, CLI_PATH);
      await app.initialize();

      const objectGraph = app.registry.getProviderGraph();
      expect(objectGraph).property('name', 'singleton');
      expect(objectGraph).nested.property('children[0].name', 'request');
      expect(objectGraph).nested.property(
        'children[0].children[0].name',
        'action'
      );

      const spoilers = /** @type {MultiValuedProviderNode} */ (objectGraph.providers.get(
        'spoilers'
      ));
      expect(spoilers).property('key', 'spoilers');
      expect(spoilers).property('multiValued', true);
      expect(spoilers)
        .property('indices')
        .instanceOf(Map);
      expect(spoilers.indices.get('answer')).property('multiValued', false);

      const actionScopeNode = objectGraph.children[0].children[0];
      const answer = actionScopeNode.providers.get('answer');
      expect(answer)
        .property('dependencies')
        .deep.equal([
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
      expect(actual).deep.equal(expected);
    });
  });
});
