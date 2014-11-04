# quinn: inject

A pretty stupid DI framework that just hides itself using random properties
on an object that needs to be passed around explicitly.

Example with express + quinn + magic:

```js
var express = require('express');
var toExpress = require('quinn-express');
var respond = require('quinn-respond');
var inject = require('quinn-inject')();

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
