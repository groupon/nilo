'use strict';

const { inspect } = require('util');

const assert = require('assert');

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
  assert.notStrictEqual(error, undefined);
  return error;
}

/** @typedef {import('../lib/typedefs').Injector} Injector */

/**
 * @param {Error & { code: string }} err
 */
function assertInvalidError(err) {
  assert.strictEqual(err.code, 'INVALID_DEPENDENCY_KEY');
}

/**
 * @param {Error & { code: string }} err
 */
function assertMissingError(err) {
  assert.ok(err.message.includes('Unknown dependency'));
  assert.strictEqual(err.code, 'INVALID_DEPENDENCY_KEY');
}

/**
 * @param {Error & { code: string }} err
 */
function assertDuplicateError(err) {
  assert.ok(err.message.includes('already been registered'));
  assert.strictEqual(err.code, 'DUPLICATE_DEPENDENCY_KEY');
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

    const CONST_VALUE = { constValue: true };

    beforeEach(() => {
      registry.singleton.setValue('constValue', CONST_VALUE);

      registry.request.setFactory('byReq', [], () => ({ byReq: true }));
      registry.request.setFactory(Symbol('byReq'), null, () => ({
        uniqueByReq: true,
      }));
      registry.action.setFactory('byAction', [], () => ({ byAction: true }));
    });

    it('allows reflection', () => {
      const provider = registry
        .getActionInjector(req, res, action)
        .getProvider();

      assert.deepStrictEqual(Object.keys(provider), ['get', 'keys']);
      assert.deepStrictEqual(
        provider
          .keys()
          .filter(k => typeof k === 'string')
          .sort(),
        ['action', 'byAction', 'byReq', 'constValue', 'request', 'response']
      );
    });

    it('has a short-hand for setting a constant value', () => {
      registry.singleton.has('constValue');
      assert.strictEqual(
        registry.getSingletonInjector().get('constValue'),
        CONST_VALUE
      );
    });

    it('exposes built-ins', () => {
      const injector = registry.getActionInjector(req, res, action);
      assert.strictEqual(injector.get('request'), req);
      assert.strictEqual(injector.get('response'), res);
      assert.strictEqual(injector.get('action'), action);
    });

    it('caches deps by request but not by action', () => {
      const first = registry.getActionInjector(req, res, action);
      const second = registry.getActionInjector(req, res, action);

      assert.strictEqual(first.get('byReq'), second.get('byReq'));

      // Repeated calls to same injector: same object
      assert.strictEqual(second.get('byAction'), second.get('byAction'));
      // Calls to different injectors: different objects
      assert.notStrictEqual(second.get('byAction'), first.get('byAction'));
      // But the objects are structurally the same
      assert.deepStrictEqual(second.get('byAction'), first.get('byAction'));
    });

    it('can be inspected', () => {
      const injector = registry.getActionInjector(req, res, action);
      assert.strictEqual(
        inspect(injector),
        'Injector<action> { action, byAction, request, response, byReq, Symbol(byReq), constValue }'
      );
      const provider = injector.getProvider();
      assert.strictEqual(
        inspect(provider),
        'Injector<action> { action, byAction, request, response, byReq, Symbol(byReq), constValue }'
      );
    });
  });

  describe('.from()', () => {
    it('accepts static and dynamic scope entries', () => {
      const deps = Registry.from([
        ['singleton', 'blah', 99],
        require('../examples/project/modules/answer/object-graph'),
      ])
        .getActionInjector()
        .getProvider();
      assert.strictEqual(deps.blah, 99);
      assert.strictEqual(deps.answer, 42);
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
      assert.strictEqual(singleton.get('missing?'), undefined);
      assert.strictEqual(singleton.get('existing?'), EXISTING);
      assert.strictEqual(singleton.get('graceful'), GRACEFUL);
      assert.strictEqual(singleton.get('lucky'), EXISTING);
      assert.strictEqual(request.get('alsoMissing?'), undefined);
      assert.strictEqual(request.get('existing?'), EXISTING);
      assert.strictEqual(request.get('graceful'), GRACEFUL);
      assert.strictEqual(request.get('lucky'), EXISTING);
    });

    it('supports the provider proxy', () => {
      const provider = singleton.getProvider();
      assert.strictEqual(provider['missing?'], undefined);
      assert.strictEqual(provider['existing?'], EXISTING);
      assert.strictEqual(provider['graceful'], GRACEFUL);
      assert.strictEqual(provider['lucky'], EXISTING);

      const reqProvider = request.getProvider();
      assert.strictEqual(reqProvider['alsoMissing?'], undefined);
      assert.strictEqual(reqProvider['existing?'], EXISTING);
      assert.strictEqual(reqProvider['graceful'], GRACEFUL);
      assert.strictEqual(reqProvider['lucky'], EXISTING);
    });

    it('supports option object syntax', () => {
      assert.strictEqual(
        singleton.get({ key: 'missing', optional: true, multiValued: false }),
        undefined
      );
      assert.strictEqual(
        singleton.get({ key: 'existing', optional: true, multiValued: false }),
        EXISTING
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
      assert.strictEqual(err.code, 'INCOMPATIBLE_DEPENDENCY_KEY');

      assert.strictEqual(
        assertThrows(() => singleton.getProvider()['single']).code,
        'INCOMPATIBLE_DEPENDENCY_KEY'
      );
    });

    it('refuses to retrieve a normal key when requesting as multi-valued', () => {
      const err = assertThrows(() => singleton.get('simple[]'));
      assert.strictEqual(err.code, 'INCOMPATIBLE_DEPENDENCY_KEY');
    });

    it('resolves to an empty list if no provider is known', () => {
      assert.deepStrictEqual(singleton.get('anyRandomName[]'), []);
      assert.strictEqual(singleton.get('fromEmpty'), 0);
      // This is a slight inconsistency that is impossible to sort out without
      // either *not* always returning arrays or using Proxy
      assert.deepStrictEqual(singleton.getProvider()['anyRandomName[]'], []);
    });

    it('resolves to a list for a single provider', () => {
      assert.deepStrictEqual(Array.from(singleton.get('single[]')), [{}]);
      assert.deepStrictEqual(Array.from(singleton.getProvider()['single[]']), [
        {},
      ]);
    });

    it('supports option object syntax', () => {
      assert.deepStrictEqual(
        Array.from(singleton.get({ key: 'single', multiValued: true })),
        [{}]
      );
    });

    it('exposes the index names of the list items', () => {
      const multi = /** @type {{ c: string }} */ (request.get('multi[]'));
      assert.strictEqual(multi.c, 'r.c');
    });

    it('does shadowing per index', () => {
      assert.deepStrictEqual(Array.from(singleton.get('multi[]')), [
        's.a(singleton:x)',
        's.b',
        's.c',
        's.d',
      ]);
      assert.deepStrictEqual(Array.from(request.get('multi[]')), [
        's.a(singleton:x)',
        's.b',
        'r.c',
        'r.d',
        'r.e',
        'r.f',
      ]);
      assert.deepStrictEqual(Array.from(action.get('multi[]')), [
        's.a(singleton:x)',
        'a.b',
        'r.c',
        'a.d',
        'r.e',
        'a.f',
        'a.g',
      ]);
    });
  });
});
