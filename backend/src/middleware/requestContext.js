/* =====================================================================
   Per-request id + a hashed client fingerprint.

   The raw IP is never stored on an order. A salted hash is enough to
   spot one device placing forty bookings, without keeping an identifier
   we have no business retaining.
   ===================================================================== */
'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../utils/logger');

/* Rotates on restart by design: useful for short-term abuse detection,
   useless as a long-term tracking key. */
const IP_SALT = crypto.randomBytes(32);

module.exports = function requestContext(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  const ip = req.ip || req.socket?.remoteAddress || '';
  req.ipHash = crypto.createHmac('sha256', IP_SALT).update(ip).digest('hex').slice(0, 32);

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const line = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(ms),
    };
    if (res.statusCode >= 500) logger.error('request', line);
    else if (res.statusCode >= 400) logger.warn('request', line);
    else if (env.NODE_ENV !== 'test') logger.info('request', line);
  });

  next();
};
