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

/* eslint-env mocha*/

'use strict';

const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

const importESM = require('../../lib/esm/import');

/**
 *
 * @param {Object} files
 * @param {Object} tmpHandle
 */
exports.writeFiles = function writeFiles(files, tmpHandle) {
  for (const [filename, content] of Object.entries(files)) {
    const absoluteFilename = path.join(tmpHandle.name, filename);
    mkdirp.sync(path.dirname(absoluteFilename));
    fs.writeFileSync(
      absoluteFilename,
      typeof content === 'string' ? content : `${JSON.stringify(content)}\n`
    );
  }
};

/**
 * @param {string=} fileEnding
 * @return {Promise<boolean>}
 */
function supports(fileEnding = 'mjs') {
  const esmFile = `../../test/env/dummy.${fileEnding}`;
  return importESM(esmFile).then(
    () => true,
    () => false
  );
}

/**
 * @return {Promise<boolean[]>}
 */
exports.supportsESM = async function supportESM() {
  return await Promise.all([supports('mjs'), supports('cjs')]);
};
