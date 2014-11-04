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

app.get('/:postId', action('show'));

// LISTEN

var server = http.createServer(app);

server.listen(process.env.PORT || 3000, function() {
  var baseUrl = 'http://127.0.0.1:' + this.address().port + '/simple';
  http.get(baseUrl, function(res) {
    assert.equal(201, res.statusCode);
    assert.equal('1000', res.headers['x-fancy']);
    assert.equal('text/html; charset=utf-8', res.headers['content-type']);
    res.setEncoding('utf8');
    var buffer = '';
    res.on('data', function(chunk) { buffer += chunk; });
    res.on('end', function() {
      assert.include('<!DOCTYPE html>', buffer);
      assert.include('</html>\n', buffer);
      console.log('Integration tested the response.');
      server.close();
    });
  });
});
