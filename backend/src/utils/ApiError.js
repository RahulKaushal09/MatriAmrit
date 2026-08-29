/* =====================================================================
   Operational errors - the ones we mean to show a customer.

   Anything thrown that is NOT an ApiError is treated as a bug and its
   message is withheld from the response.
   ===================================================================== */
'use strict';

class ApiError extends Error {
  constructor(statusCode, message, { code = null, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg, opts) { return new ApiError(400, msg, { code: 'BAD_REQUEST', ...opts }); }
  static unauthorized(msg = 'Unauthorised') { return new ApiError(401, msg, { code: 'UNAUTHORISED' }); }
  static forbidden(msg = 'Forbidden') { return new ApiError(403, msg, { code: 'FORBIDDEN' }); }
  static notFound(msg = 'Not found') { return new ApiError(404, msg, { code: 'NOT_FOUND' }); }
  static conflict(msg, opts) { return new ApiError(409, msg, { code: 'CONFLICT', ...opts }); }
  static unprocessable(msg, opts) { return new ApiError(422, msg, { code: 'UNPROCESSABLE', ...opts }); }
  static tooMany(msg = 'Too many requests') { return new ApiError(429, msg, { code: 'RATE_LIMITED' }); }
  static payment(msg, opts) { return new ApiError(402, msg, { code: 'PAYMENT_ERROR', ...opts }); }
  static internal(msg = 'Something went wrong') { return new ApiError(500, msg, { code: 'INTERNAL' }); }
}

module.exports = ApiError;
