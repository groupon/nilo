'use strict';

const assert = require('chai').assert;

const Registry = require('../lib/registry');

/**
 * @param {() => void} fn
 */
function assertThrows(fn) {
  let error;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  assert.notEqual(undefined, error);
  return error;
}

/** @typedef {import('../lib/typedefs').Injector} Injector */

/**
 * @param {Error & { code: string }} err
 */
function assertInvalidError(err) {
  assert.equal('INVALID_DEPENDENCY_KEY', err.code);
}

/**
 * @param {Error & { code: string }} err
 */
function assertMissingError(err) {
  assert.include(err.message, 'Unknown dependency');
  assert.equal('INVALID_DEPENDENCY_KEY', err.code);
}

/**
 * @param {Error & { code: string }} err
 */
function assertDuplicateError(err) {
  assert.include(err.message, 'already been registered');
  assert.equal('DUPLICATE_DEPENDENCY_KEY', err.code);
}

describe('Registry', () => {
  const EXISTING = {};
  const GRACEFUL = {};

  /** @type {Registry} */
  let registry;
  beforeEach(() => {
    registry = new Registry();
  });

  describe('#getActionInjector', () => {
    const req = /** @type {any} */ ({});
    const res = /** @type {any} */ ({});
    const action = /** @type {any} */ ({});

    beforeEach(() => {
      registry.request.setFactory('byReq', [], () => ({ byReq: true }));
      registry.action.setFactory('byAction', [], () => ({ byAction: true }));
    });

    it('allows reflection', () => {
      const provider = registry
        .getActionInjector(req, res, action)
        .getProvider();

      assert.deepEqual(['get', 'keys'], Object.keys(provider));
      assert.deepEqual(
        ['action', 'byAction', 'byReq', 'request', 'response'],
        provider.keys().sort()
      );
    });

    it('exposes built-ins', () => {
      const injector = registry.getActionInjector(req, res, action);
      assert.equal(req, injector.get('request'));
      assert.equal(res, injector.get('response'));
      assert.equal(action, injector.get('action'));
    });

    it('caches deps by request but not by action', () => {
      const first = registry.getActionInjector(req, res, action);
      const second = registry.getActionInjector(req, res, action);

      assert.equal(first.get('byReq'), second.get('byReq'));

      // Repeated calls to same injector: same object
      assert.equal(second.get('byAction'), second.get('byAction'));
      // Calls to different injectors: different objects
      assert.notEqual(second.get('byAction'), first.get('byAction'));
      // But the objects are structurally the same
      assert.deepEqual(second.get('byAction'), first.get('byAction'));
    });
  });

  describe('optional dependencies', () => {
    /** @type {Injector} */
    let singleton;
    /** @type {Injector} */
    let request;

    beforeEach(() => {
      registry.singleton.setFactory('existing', null, () => EXISTING);

      registry.singleton.setFactory(
        'graceful',
        ['existing', 'missing?'],
        () => GRACEFUL
      );

      registry.singleton.setFactory(
        'lucky',
        ['existing?'],
        deps => deps.existing
      );

      registry.singleton.setFactory(
        'failing',
        ['existing', 'missing'],
        () => GRACEFUL
      );

      const req = /** @type {any} */ ({});
      const res = /** @type {any} */ ('res');
      singleton = registry.getSingletonInjector();
      request = registry.getRequestInjector(req, res);
    });

    it('gracefully ignores missing optional deps', () => {
      assert.equal(singleton.get('missing?'), undefined);
      assert.equal(singleton.get('existing?'), EXISTING);
      assert.equal(singleton.get('graceful'), GRACEFUL);
      assert.equal(singleton.get('lucky'), EXISTING);
      assert.equal(request.get('alsoMissing?'), undefined);
      assert.equal(request.get('existing?'), EXISTING);
      assert.equal(request.get('graceful'), GRACEFUL);
      assert.equal(request.get('lucky'), EXISTING);
    });

    it('supports the provider proxy', () => {
      const provider = singleton.getProvider();
      assert.equal(provider['missing?'], undefined);
      assert.equal(provider['existing?'], EXISTING);
      assert.equal(provider['graceful'], GRACEFUL);
      assert.equal(provider['lucky'], EXISTING);

      const reqProvider = request.getProvider();
      assert.equal(reqProvider['alsoMissing?'], undefined);
      assert.equal(reqProvider['existing?'], EXISTING);
      assert.equal(reqProvider['graceful'], GRACEFUL);
      assert.equal(reqProvider['lucky'], EXISTING);
    });

    it('supports option object syntax', () => {
      assert.equal(
        undefined,
        singleton.get({ key: 'missing', optional: true, multiValued: false })
      );
      assert.equal(
        EXISTING,
        singleton.get({ key: 'existing', optional: true, multiValued: false })
      );
    });

    it('throws on "real" missing deps', () => {
      assertMissingError(assertThrows(() => singleton.get('missing')));
      assertMissingError(assertThrows(() => singleton.get('failing')));
      assertMissingError(
        assertThrows(() => singleton.getProvider()['missing'])
      );
      assertMissingError(
        assertThrows(() => singleton.getProvider()['failing'])
      );
    });
  });

  describe('multi-valued dependencies', () => {
    /** @type {Injector} */
    let singleton;
    /** @type {Injector} */
    let request;
    /** @type {Injector} */
    let action;

    beforeEach(() => {
      registry.singleton.setFactory('single[existing]', null, () => EXISTING);
      registry.singleton.setFactory('simple', null, () => 'foobar');

      registry.singleton.setFactory('x', null, () => 'singleton:x');
      registry.request.setFactory('x', null, () => 'request:x');
      registry.action.setFactory('x', null, () => 'action:x');

      // a: singleton, not shadowed
      registry.singleton.setFactory(
        'multi[a]',
        ['x'],
        deps => `s.a(${deps.x})`
      );
      // b: singleton, shadowed in action
      registry.singleton.setFactory('multi[b]', null, () => 's.b');
      registry.action.setFactory('multi[b]', null, () => 'a.b');
      // c: singleton, shadowed in request
      registry.singleton.setFactory('multi[c]', null, () => 's.c');
      registry.request.setFactory('multi[c]', null, () => 'r.c');
      // d: singleton, shadowed in request + action
      registry.singleton.setFactory('multi[d]', null, () => 's.d');
      registry.request.setFactory('multi[d]', null, () => 'r.d');
      registry.action.setFactory('multi[d]', null, () => 'a.d');
      // e: request, not shadowed
      registry.request.setFactory('multi[e]', null, () => 'r.e');
      // f: request, shadowed in action
      registry.request.setFactory('multi[f]', null, () => 'r.f');
      registry.action.setFactory('multi[f]', null, () => 'a.f');
      // g: action only
      registry.action.setFactory('multi[g]', null, () => 'a.g');

      registry.singleton.setFactory(
        'fromEmpty',
        ['empty[]'],
        deps => deps.empty.length
      );

      registry.singleton.setFactory('fromMulti', ['multi[]'], deps =>
        deps.multi.join(':')
      );

      const req = /** @type {any} */ ({});
      singleton = registry.getSingletonInjector();
      request = registry.getRequestInjector(req, /** @type {any} */ ('res'));
      action = registry.getActionInjector(
        req,
        /** @type {any} */ ('res'),
        'action'
      );
    });

    it('refuses to set a key if it has already been marked as multiValued', () => {
      assertDuplicateError(
        assertThrows(() =>
          registry.singleton.setFactory('single', null, () => 'foo')
        )
      );
    });

    it('refuses to set a key without index', () => {
      assertInvalidError(
        assertThrows(() =>
          registry.singleton.setFactory('single[]', null, () => 'foo')
        )
      );
    });

    it('refuses to set a key with existing index', () => {
      assertDuplicateError(
        assertThrows(() =>
          registry.singleton.setFactory('single[existing]', null, () => 'foo')
        )
      );
    });

    it('refuses to set a key as multiValued after the fact', () => {
      assertDuplicateError(
        assertThrows(() =>
          registry.singleton.setFactory('simple[foo]', null, () => 'foo')
        )
      );
    });

    it('refuses to retrieve a multi-values key when requesting a single value', () => {
      const err = assertThrows(() => singleton.get('single'));
      assert.equal('INCOMPATIBLE_DEPENDENCY_KEY', err.code);

      assert.equal(
        'INCOMPATIBLE_DEPENDENCY_KEY',
        assertThrows(() => singleton.getProvider()['single']).code
      );
    });

    it('refuses to retrieve a normal key when requesting as multi-valued', () => {
      const err = assertThrows(() => singleton.get('simple[]'));
      assert.equal('INCOMPATIBLE_DEPENDENCY_KEY', err.code);
    });

    it('resolves to an empty list if no provider is known', () => {
      assert.deepEqual([], singleton.get('anyRandomName[]'));
      assert.deepEqual(0, singleton.get('fromEmpty'));
      // This is a slight inconsistency that is impossible to sort out without
      // either *not* always returning arrays or using Proxy
      assert.deepEqual([], singleton.getProvider()['anyRandomName[]']);
    });

    it('resolves to a list for a single provider', () => {
      assert.deepEqual([{}], singleton.get('single[]'));
      assert.deepEqual([{}], singleton.getProvider()['single[]']);
    });

    it('supports option object syntax', () => {
      assert.deepEqual(
        [{}],
        singleton.get({ key: 'single', multiValued: true })
      );
    });

    it('exposes the index names of the list items', () => {
      const multi = /** @type {{ c: string }} */ (request.get('multi[]'));
      assert.equal('r.c', multi.c);
    });

    it('does shadowing per index', () => {
      assert.deepEqual(
        ['s.a(singleton:x)', 's.b', 's.c', 's.d'],
        singleton.get('multi[]')
      );
      assert.deepEqual(
        ['s.a(singleton:x)', 's.b', 'r.c', 'r.d', 'r.e', 'r.f'],
        request.get('multi[]')
      );
      assert.deepEqual(
        ['s.a(singleton:x)', 'a.b', 'r.c', 'a.d', 'r.e', 'a.f', 'a.g'],
        action.get('multi[]')
      );
    });
  });
});
