'use strict';

const Graph = require('./graph');
const Annotations = require('./annotations'),
      Inject = Annotations.Inject,
      Provides = Annotations.Provides;

function createGraph(spec) {
  return new Graph(spec);
}

module.exports = createGraph;
createGraph.Inject = Inject;
createGraph.Provides = Provides;
createGraph.createGraph = createGraph;
createGraph['default'] = createGraph;
