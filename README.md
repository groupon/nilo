# nilo (ex nihilo)

> Ex nihilo is a Latin phrase meaning "out of nothing".
> It often appears in conjunction with the concept of creation,
> as in creatio ex nihilo, meaning "creation out of nothing"—chiefly in philosophical
> or theological contexts, but also occurs in other fields.

A basic DI framework with support for decorators.

```js
import { Provides, Inject, createGraph } from 'nilo';

class A { constructor(x) { this.x = x; } }

@Inject('n')
class B { constructor(n) { this.n = n; } }

@Inject(A, B)
class Dependent {
  constructor(a, b) { this.answer = a.x + b.n; }
}

const graph = createGraph({
  @Provides(A)
  getA() { return new A(40); }

  @Provides('n')
  getNumber() { return 2; }
});

const rootScope = graph.createScope();
console.log('The answer is %d.', rootScope.get(Dependent).answer);

const extendedGraph = createGraph({
  @Inject(Dependent, 'request')
  @Provides('randomString')
  getRandomString(d, request) { return `${d} ${request.url}`; }
});
const childScope = extendedGraph.createScope(rootScope)
  .set('request', { url: '/users/me' });
console.log(childScope.get('randomString'));
```
