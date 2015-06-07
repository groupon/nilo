'use strict';

const test = require('tape');

const Annotations = require('../lib/annotations'),
      Inject = Annotations.Inject,
      Provides = Annotations.Provides;
const Graph = require('../lib/graph');
const Scope = require('../lib/scope');

test('Instantiate class with dependencies', function(t) {
  class A {
    constructor(n) { this.n = n || 40; }
    getA() { return this.n; }
  }
  class B { getB() { return 2; } }

  class Dependent {
    constructor(a, b) {
      this.answer = a.getA() + b.getB();
    }
  }
  Inject(A, 'b')(Dependent); // @Inject(A, 'b') on class

  const scope = new Graph()
    .value(A, new A())
    .value('b', new B())
    .createScope();
  const instance = scope.construct(Dependent);
  t.equal(instance.answer, 42, 'Uses the singletons');

  const minimalScope = new Graph({
    getB: Provides('b')(function() { return new B(); }),
    getN: Provides('n')(function() { return 11; })
  }).createScope().set('req', { url: '/foo' });
  t.throws(function() {
    minimalScope.construct(Dependent);
  }, `Can't create if A is not injectable`);
  Inject('n')(A); // enable A for injection
  const instance13 = minimalScope.construct(Dependent);
  t.equal(instance13.answer, 13, 'Injects n=11 into A');

  t.end();
});
