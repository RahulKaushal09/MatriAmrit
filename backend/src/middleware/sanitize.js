/* =====================================================================
   NoSQL injection guard.

   Mongo treats an object like { $gt: "" } as an operator. If that ever
   reaches a query built from request input, a filter matches every
   document. We strip any key starting with "$" or containing "." from
   body, query and params before a route sees them.

   Written by hand rather than pulled from express-mongo-sanitize, which
   mutates req.query - a getter on newer Express and a source of crashes.
   ===================================================================== */
'use strict';

const logger = require('../utils/logger');

const MAX_DEPTH = 8;

function scrub(value, depth, hits) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = scrub(value[i], depth + 1, hits);
    return value;
  }

  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') {
      hits.push(key);
      delete value[key];
      continue;
    }
    value[key] = scrub(value[key], depth + 1, hits);
  }
  return value;
}

module.exports = function sanitize(req, _res, next) {
  const hits = [];

  if (req.body && typeof req.body === 'object') scrub(req.body, 0, hits);
  if (req.params && typeof req.params === 'object') scrub(req.params, 0, hits);

  /* req.query can be a getter-only property. Scrub its contents in
     place instead of reassigning the object. */
  if (req.query && typeof req.query === 'object') scrub(req.query, 0, hits);

  if (hits.length) {
    logger.warn('Stripped Mongo operator keys from request', { path: req.path, keys: hits });
  }
  next();
};
