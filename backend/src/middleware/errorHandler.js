/* =====================================================================
   Terminal error handling.

   Rule: only an ApiError's message reaches the client. Everything else
   is logged in full and answered with a generic 500, so a stack trace or
   a Mongo error string never leaks the schema to the internet.
   ===================================================================== */
'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

function notFound(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

/* eslint-disable-next-line no-unused-vars -- Express identifies the error
   handler by its four-argument signature. */
function errorHandler(err, req, res, _next) {
  let error = err;

  /* Translate the errors we know how to phrase for a customer. */
  if (!(error instanceof ApiError)) {
    if (err && err.name === 'ValidationError' && err.errors) {
      const details = Object.values(err.errors).map(e => ({ field: e.path, message: e.message }));
      error = ApiError.unprocessable('Some details could not be saved.', { details });
    } else if (err && err.code === 11000) {
      error = ApiError.conflict('That record already exists.');
    } else if (err && err.name === 'CastError') {
      error = ApiError.badRequest('A supplied identifier is not valid.');
    } else if (err && err.type === 'entity.too.large') {
      error = ApiError.badRequest('Request body is too large.');
    } else if (err && err.type === 'entity.parse.failed') {
      error = ApiError.badRequest('Request body is not valid JSON.');
    } else if (err && err.message === 'Origin not allowed by CORS') {
      error = ApiError.forbidden('This origin is not permitted to call the API.');
    } else {
      error = ApiError.internal();
    }
  }

  const logMeta = {
    status: error.statusCode,
    method: req.method,
    path: req.originalUrl,
    requestId: req.id,
  };

  if (error.statusCode >= 500) {
    logger.error(err.message || 'Unhandled error', { ...logMeta, stack: err.stack });
  } else {
    logger.warn(error.message, logMeta);
  }

  res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code || 'ERROR',
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      ...(env.NODE_ENV === 'development' && error.statusCode >= 500 ? { stack: err.stack } : {}),
    },
    requestId: req.id,
  });
}

module.exports = { notFound, errorHandler };
