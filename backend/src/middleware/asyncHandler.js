'use strict';

/** Wraps an async route so a rejected promise reaches the error handler. */
module.exports = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
