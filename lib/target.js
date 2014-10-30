'use strict';

var Bluebird = require('bluebird');

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

function createTarget(init) {
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

module.exports = createTarget;
createTarget['default'] = createTarget;
