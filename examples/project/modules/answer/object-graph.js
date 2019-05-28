'use strict';

module.exports = (/** @type {import('../../../../').Registry} */ registry) => {
  registry.singleton.setValue('base', 21);

  registry.request.setValue('factor', 2);

  registry.action.setFactory(
    'answer',
    ['base', 'factor'],
    ({ base, factor }) => base * factor
  );

  registry.singleton.setValue('spoilers[answer]', 42);
};
