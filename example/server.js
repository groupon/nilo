'use strict';

var http = require('http');

var Bluebird = require('bluebird');
var respond = require('quinn-respond');

function Container(scope, parent) {
  this._scope = scope;
  this._parent = parent || null;
  this._cache = {};
}

Container.prototype._create =
function _create(name) {
  var scope = this._scope;
  var parent = this._parent;

  if (scope.canCreate(name)) {
    return scope.create(name, this);
  } else if (parent) {
    return parent.get(name);
  }
  throw new Error('Unknown component: ' + name);
};

Container.prototype.get =
function get(name) {
  var cache = this._cache;

  if (!cache.hasOwnProperty(name))
    return this.set(name, this._create(name));
  else
    return cache[name];
};

Container.prototype.set =
function set(name, value) {
  this._cache[name] = value;
  return value;
};

// ported from angular.js
var COMMENTS_PATTERN = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGS_PATTERN = /^function\s*(\*)?\s*[^\(]*\(\s*([^\)]*)\)/m;
var ARG_PATTERN = /^\s*(_?)(\S+?)\1\s*$/;
function extractDependencies(fn) {
  var source = fn.toString().replace(COMMENTS_PATTERN, '');
  var fnArgs = source.match(ARGS_PATTERN)[2];
  var dependencies = fnArgs.split(',').map(function(arg) {
    return arg.replace(ARG_PATTERN, '$2');
  }).filter(function(dep) { return !!dep; });
  return dependencies.concat([fn]);
}

function parseInitializer(init) {
  if (typeof init === 'function') {
    init = extractDependencies(init);
  }

  var deps, fn;
  if (Array.isArray(init)) {
    deps = init.slice(0, init.length - 1);
    fn = init[init.length - 1];
  } else {
    throw new Error('Invalid inject target: ' + String(init));
  }

  function createFromContainer(container) {
    var params = deps.map(function(dep) {
      return container.get(dep);
    });
    return Bluebird.all(params).spread(fn);
  }

  createFromContainer.fn = fn;
  createFromContainer.dependencies = deps;

  return createFromContainer;
}

function Scope(name) {
  this._name = name;
  this._registry = {};
}

Scope.prototype.register =
function register(name, init) {
  this._registry[name] = parseInitializer(init);
};

Scope.prototype.canCreate =
function canCreate(name) {
  return this._registry.hasOwnProperty(name);
};

Scope.prototype.create =
function create(name, context) {
  var init = this._registry[name];
  return init(context);
};

Scope.prototype.createContainer =
function createContainer(parent) {
  return new Container(this, parent);
};

Scope.prototype.setArguments = function(argNames) {
  argNames.forEach(function(arg, idx) {
    this.register(arg, [ '$args', function(scopeArgs) {
      return scopeArgs[idx];
    }]);
  }, this);
};

function Environment() {
  this._scopes = {};
  this._activeContainer = null;
}

Environment.prototype.getScope = function(name) {
  var scope = this._scopes[name];
  if (!scope) {
    scope = this._scopes[name] = new Scope(name);
    this[name] = this.createEntryPoint.bind(this, scope);
  }
  return scope;
};

Environment.prototype.runInScope = function(scope, args, callback) {
  var container = scope.createContainer(this._activeContainer);
  container.set('$args', args);
  this._activeContainer = container;
  callback(container);
};

var __slice = Array.prototype.slice;
Environment.prototype.createEntryPoint = function(scope, init) {
  var self = this;
  init = parseInitializer(init);
  function enterScope() {
    var args = __slice.call(arguments);
    return new Bluebird(function(resolve, reject) {
      self.runInScope(scope, args, function(container) {
        resolve(init(container));
      });
    });
  };

  enterScope.fn = init.fn;
  enterScope.dependencies = init.dependencies;

  return enterScope;
};

var inject = new Environment();

var globalScope = inject.getScope('global');
globalScope.register('x', function(z) {
  return z + 'globalX';
});
globalScope.register('z', function() {
  return 'globalZ';
});

var requestScope = inject.getScope('request');
requestScope.setArguments([ 'req', 'res' ]);
requestScope.register('y', [ 'x', function(foo) {
  return foo + 'reqY';
}]);
requestScope.register('z', function() {
  return 'reqZ';
});

var actionScope = inject.getScope('action');
actionScope.setArguments([ 'req', 'params' ]);

var globalContainer = globalScope.createContainer();

var handler = inject.action(function(req, x, params) {
  return respond()
    .json({
      url: req.url,
      x: x,
      query: params.q
    }, null, 2);
});

var server = http.createServer(function(req, res) {
  // hack because we don't have cls yet
  inject._activeContainer = globalContainer;

  inject.runInScope(requestScope, [ req, res ],
    function() {
      var params = { q: 'query' };

      handler(req, params)
        .then(respond)
        .then(function(stream) {
          stream.pipe(res);
        })
        .catch(function(err) {
          res.statusCode = 500;
          res.end(err.stack);
        });
    });
});

server.listen(process.env.PORT || 3000, function() {
  var baseUrl = 'http://127.0.0.1:' + this.address().port + '/xyz';
  http.get(baseUrl, function(res) {
    console.log(res.statusCode, res.headers);
    res.pipe(process.stdout, { end: false });
    res.on('end', function() {
      server.close();
    });
  });
});
