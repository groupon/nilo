'use strict';

const Annotation = require('footnote'),
      createAnnotation = Annotation.create;

function Inject() {
  const tags = [].slice.apply(arguments);
  return createAnnotation(Inject.prototype, {
    tags: { value: tags, enumerable: true, configurable: true }
  });
}
exports.Inject = Inject;

function Provides(tag) {
  return createAnnotation(Provides.prototype, {
    tag: { value: tag, enumerable: true, configurable: true }
  });
}
exports.Provides = Provides;
