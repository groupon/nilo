# nilo (ex nihilo)

> Ex nihilo is a Latin phrase meaning "out of nothing".
> It often appears in conjunction with the concept of creation,
> as in creatio ex nihilo, meaning "creation out of nothing"—chiefly in philosophical
> or theological contexts, but also occurs in other fields.

A pretty stupid DI framework that just hides itself using random properties
on an object that needs to be passed around explicitly.

Example with express + quinn + magic:

```js
var express = require('express');
var toExpress = require('quinn/express');
var respond = require('quinn/respond');
var inject = require('nilo')();

inject.getRootScope()
  .register('x', function() { return 10; });

inject.getScope('action')
  .setArguments([ 'req', 'params' ])
  .register('query', function(req) { return req.query; });

// Create express app
var app = express();

function *myHandler(params, x, query) {
  var obj = loadFromDatabase(params.id);
  return respond()
    .json({ obj: yield obj, x: x, query: query });
}

app.get('/my/:id', toExpress(inject.action(myHandler)));
```
