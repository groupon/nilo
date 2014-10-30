'use strict';

var http = require('http');
var fs = require('fs');

var express = require('express');
var controller = require('quinn-controller');
var respond = require('quinn-respond');
var toExpress = require('quinn-express');
var _ = require('lodash');

var injectMiddleware = require('../middleware');

var inject = require('./env.js');

// APP SETUP

var app = express();

app.use(injectMiddleware(inject, 'request'));

// CONTROLLER

var PostsController = {
  show: inject.action(function(params, query, I18n) {
    return respond()
      .json({
        id: params.postId,
        page: parseInt(query.page, 10),
        title: I18n.translate('.hello')
      }, null, 2);
  })
};

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
    console.log(res.statusCode, res.headers);
    res.pipe(process.stdout, { end: false });
    res.on('end', function() {
      server.close();
    });
  });
});
