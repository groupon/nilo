/*
 * Copyright (c) 2019, Groupon
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 *
 * Neither the name of GROUPON nor the names of its contributors may be
 * used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
 * PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

const Commander = require('commander');

/**
 * @typedef {import('./app')} App
 * @typedef {import('./typedefs').CommandConfig<any>} CommandConfig
 */

/**
 * @template Options
 * @param {App} app
 * @param {(app: App, options: Options, ...args: string[]) => Promise<number | void>} fn
 * @returns {(options: Options, ...args: string[]) => Promise<void>}
 */
function wrapCommandExecution(app, fn) {
  return async (options, ...args) => {
    try {
      const exitCode = (await fn(app, options, ...args)) || 0;
      process.exit(exitCode);
    } catch (e) {
      process.stderr.write(`\
[Unhandled Error] ${e.stack}

${JSON.stringify(e)}

This shouldn't happen but... it did.
`);
      process.exit(1);
    }
  };
}

/**
 * @param {App} app
 * @param {string} defaultCommand
 * @param {string[]} argv
 */
async function main(app, defaultCommand = 'start', argv = process.argv) {
  await app.initialize();

  const commandConfigs = /** @type {{ [name: string]: CommandConfig }} */ (app.registry
    .getSingletonInjector()
    .get('commands[]'));

  const pkgJson = app.project.requireBundled('./package.json');
  const program = Commander.version(pkgJson.version).name(pkgJson.name);

  for (const [name, commandConfig] of Object.entries(commandConfigs)) {
    if (Number.isFinite(+name)) continue;
    const cmd = program.command(name).description(commandConfig.description);

    if (commandConfig.init) {
      commandConfig.init(cmd);
    }
    cmd.action(wrapCommandExecution(app, commandConfig.action));
  }

  /**
   * @param {string | Commander.Command} arg
   */
  function isCommand(arg) {
    return arg instanceof Commander.Command;
  }

  let result = program.parse(argv);
  if (!isCommand(result.args[0])) {
    argv.splice(2, 0, defaultCommand);
    result = program.parse(argv);
  }

  if (!isCommand(result.args[0])) {
    program.outputHelp();
    process.exit(1);
  }
}
module.exports = /** @type {import('./typedefs').main} */ (main);
