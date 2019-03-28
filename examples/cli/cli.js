'use strict';

const { App, main } = require('../../');

const app = new App(process.cwd(), __dirname);

/**
 * @param {string | number | undefined} value
 * @returns {number}
 */
function toNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new TypeError('Expected numeric value');
  }
  return n;
}

/**
 * @typedef Options
 * @prop {number} code
 */

/**
 * @param {App} ctx
 * @param {Options} options
 */
async function start(ctx, options) {
  await ctx.initialize();
  await ctx.configure();

  if (options.code) {
    return options.code;
  }
  process.stdout.write(`${ctx.appDirectory}\n`);
  return 0;
}

app.registry.singleton.setFactory('commands[start]', null, () => {
  return {
    description: 'Launch all the things',
    action: start,
    /**
     * @param {import('commander').Command} cmd
     */
    init(cmd) {
      cmd.option('-c, --code <code>', 'Force exit code', toNumber);
    },
  };
});

main(app, 'start');
