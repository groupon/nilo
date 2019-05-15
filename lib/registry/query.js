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
 * @typedef {import('../typedefs').DependencyQuery} DependencyQuery
 * @typedef {import('../typedefs').DependencyDescriptor} DependencyDescriptor
 */

/**
 * @param {string} query
 * @returns {DependencyDescriptor}
 */
function parseDependencyQueryString(query) {
  const optMarkerIdx = query.indexOf('?');
  if (optMarkerIdx !== -1) {
    return {
      key: query.slice(0, optMarkerIdx),
      optional: true,
      multiValued: false,
    };
  }
  const listMarkerIdx = query.indexOf('[');
  if (listMarkerIdx !== -1) {
    const listMarkerEndIdx = query.indexOf(']', listMarkerIdx);
    if (listMarkerEndIdx === -1) {
      throw new Error('TODO: Good error');
    }
    return {
      key: query.slice(0, listMarkerIdx),
      index: query.slice(listMarkerIdx + 1, listMarkerEndIdx),
      multiValued: true,
    };
  }
  return { key: query, optional: false, multiValued: false };
}

/** @type {Map<string, DependencyDescriptor>} */
const queryStringCache = new Map();

/**
 * @param {DependencyQuery} query
 * @returns {DependencyDescriptor}
 */
function parseDependencyQuery(query) {
  if (typeof query === 'symbol') {
    return { key: query, optional: false, multiValued: false };
  }
  if (typeof query !== 'string') return query;
  let descriptor = queryStringCache.get(query);
  if (!descriptor) {
    descriptor = parseDependencyQueryString(query);
    queryStringCache.set(query, descriptor);
  }
  return descriptor;
}
exports.parseDependencyQuery = parseDependencyQuery;
