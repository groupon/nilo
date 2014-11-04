'use strict';

var Bluebird = require('bluebird');
var respond = require('quinn-respond');

// "async function", using Bluebird.coroutine is awkward
// because it hides the arguments from us.
function *harmonyAction(query) {
  yield Bluebird.delay(10);
  return respond.json(query);
};

module.exports = harmonyAction;
