require('reflect-metadata');

import test from 'tape';

import { createGraph, Inject } from '../';

@Inject()
class Brass {}

@Inject()
class Woodwinds {}

@Inject()
class Orchestra {
  constructor(brass: Brass, woodwinds: Woodwinds) {
    this.brass = brass;
    this.woodwinds = woodwinds;
  }
}

test('Inject from type hints', t => {
  const scope = createGraph().createScope();
  const o = scope.construct(Orchestra);
  t.ok(o instanceof Orchestra, 'Creates an Orchestra');
  t.ok(o.brass instanceof Brass, 'Has a Brass section');
  t.ok(o.woodwinds instanceof Woodwinds, 'Has a Woodwinds section');
  t.end();
});
