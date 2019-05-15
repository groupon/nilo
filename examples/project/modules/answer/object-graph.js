'use strict';

module.exports = (/** @type {import('../../../../').Registry} */ registry) => {
  registry.singleton.setFactory('base', null, () => 21);

  registry.request.setFactory('factor', null, () => 2);

  registry.action.setFactory(
    'answer',
    ['base', 'factor'],
    ({ base, factor }) => base * factor
  );

  registry.singleton.setFactory('spoilers[answer]', null, () => 42);
};
