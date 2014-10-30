'use strict';

var http = require('http');

var express = require('express');
var controller = require('quinn-controller/express');
var respond = require('quinn-respond');

var injectMiddleware = require('../middleware');

var inject = require('./env.js');

var app = express();

app.use(injectMiddleware(inject, 'request'));

var PostsController = {
  show: inject.action(function(params, query, I18n) {
    return respond.json({
      id: params.postId,
      page: parseInt(query.page, 10),
      title: I18n.translate('.hello')
    }, null, 2);
  })
};

var action = controller('posts', PostsController);
app.get('/:postId', action('show'));

var server = http.createServer(app);

server.listen(process.env.PORT || 3000, function() {
  var baseUrl = 'http://127.0.0.1:' + this.address().port + '/xyz?page=2';
  http.get(baseUrl, function(res) {
    console.log(res.statusCode, res.headers);
    res.pipe(process.stdout, { end: false });
    res.on('end', function() {
      server.close();
    });
  });
});
