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

/**
 * @typedef DumpObjectGraphOptions
 * @prop {boolean} json
 */

/**
 * @param {string} propKey
 * @param {unknown} propValue
 */
function convertMaps(propKey, propValue) {
  if (propValue instanceof Map) {
    const output = /** @type {{ [key: string]: any }} */ ({});
    for (const [key, value] of propValue) {
      output[key.toString()] = value;
    }
    return output;
  }
  return propValue;
}

module.exports = /** @type {import('../typedefs').CommandConfig<DumpObjectGraphOptions>} */ ({
  name: 'dump-object-graph',
  description: 'Dump known object graph providers and their dependencies',

  init(cmd) {
    cmd.option('--json', 'Print the raw data as JSON');
  },

  async action(app, options) {
    const data = app.registry.getProviderGraph();
    if (options.json) {
      process.stdout.write(`${JSON.stringify(data, convertMaps)}\n`);
      return 0;
    }

    throw new Error(
      'Pretty printing is not implemented yet, please use --json'
    );
  },
});
