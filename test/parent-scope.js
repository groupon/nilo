'use strict';

const test = require('tape');

const Annotations = require('../lib/annotations'),
      Inject = Annotations.Inject,
      Provides = Annotations.Provides;
const Graph = require('../lib/graph');
const Scope = require('../lib/scope');

test('Scope inheritance', function(t) {
  class A { constructor(x) {
    if (x === undefined) console.trace('w/o x');
    this.x = x; }
  }

  class B { constructor(n) { this.n = n; } }
  Inject('n')(B);

  class Dependent {
    constructor(a, b) { this.answer = a.x + b.n; }
  }
  Inject(A, B)(Dependent);

  const graph = new Graph({
    getA: Provides(A)(function() { return new A(40); }),
    getNumber: Provides('n')(function() { return 2; })
  });

  const rootScope = graph.createScope();
  t.equal(rootScope.get(Dependent).answer, 42,
    'Correctly constructs the Dependent class');

  const extendedGraph = new Graph({
    getRandomString: Inject(Dependent, 'request')(
      Provides('randomString')(
        function(d, request) { return `${d.answer} ${request.url}`; }
      )
    )
  });
  const childScope = extendedGraph.createScope(rootScope)
    .set('request', { url: '/users/me' });
  t.equal(childScope.get('randomString'), '42 /users/me');
  t.end();
});
