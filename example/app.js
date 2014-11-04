'use strict';

var http = require('http');
var fs = require('fs');

var express = require('express');
var controller = require('quinn-controller');
var respond = require('quinn-respond');
var toExpress = require('quinn-express');
var _ = require('lodash');
var assert = require('assertive');
var Bluebird = require('bluebird');

var injectMiddleware = require('../middleware');

var inject = require('./env.js');

// APP SETUP

var app = express();

app.use(injectMiddleware(inject, 'request'));

// CONTROLLER

var PostsController = {
  show: inject.action(function(params, query, I18n) {
    return respond()
      .status(400)
      .json({
        id: params.postId,
        page: parseInt(query.page, 10),
        title: I18n.translate('.hello')
      }, null, 2);
  })
};

try {
  PostsController.harmony = inject.action(require('./harmony-action'));
} catch (err) {
  if (/Unexpected token \*/.test(err.message))
    console.log('Environment does not support generators');
  else
    throw err;
}

// TESTING

var TestI18n = { translate: function(key) { return key; } };
Bluebird.try(PostsController.show.fn, [
    { postId: 'x' }, { page: '9' }, TestI18n
  ])
  .then(function(testResponse) {
    assert.equal(400, testResponse.statusCode);
    assert.equal(
      'application/json; charset=utf-8',
      testResponse.getHeader('content-type'));
    assert.deepEqual({
      id: 'x', page: 9, title: '.hello'
    }, testResponse.getData());
    console.log('Unit tested the response.');
  })
  .done();

// ROUTING

var action = _.compose(toExpress, controller('posts', PostsController));

app.get('/simple', toExpress(function(req, params) {
  return respond()
    .html(fs.createReadStream(__dirname + '/simple.html'))
    .header('x-fancy', '1000')
    .status(201);
}));

if (PostsController.harmony)
  app.get('/harmony', action('harmony'));

app.get('/:postId', action('show'));

// LISTEN

var server = http.createServer(app);

server.listen(process.env.PORT || 3000, function() {
  var baseUrl = 'http://127.0.0.1:' + this.address().port;

  function done() {
    console.log('Integration tested the response.');
    server.close();
  }

  function testHarmony() {
    http.get(baseUrl + '/harmony?x=foo&a=bar', function(res) {
      assert.equal(200, res.statusCode);
      res.setEncoding('utf8');
      var buffer = '';
      res.on('data', function(chunk) { buffer += chunk; });
      res.on('end', function() {
        var data = JSON.parse(buffer);
        assert.deepEqual({ x: 'foo', a: 'bar' }, data);
        done();
      });
    });
  }

  http.get(baseUrl + '/simple', function(res) {
    assert.equal(201, res.statusCode);
    assert.equal('1000', res.headers['x-fancy']);
    assert.equal('text/html; charset=utf-8', res.headers['content-type']);
    res.setEncoding('utf8');
    var buffer = '';
    res.on('data', function(chunk) { buffer += chunk; });
    res.on('end', function() {
      assert.include('<!DOCTYPE html>', buffer);
      assert.include('</html>\n', buffer);
      if (PostsController.harmony) {
        testHarmony();
      } else {
        done();
      }
    });
  });
});
