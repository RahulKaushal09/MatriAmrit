/* =====================================================================
   Security middleware chain.
   ===================================================================== */
'use strict';

const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const env = require('../config/env');
const logger = require('../utils/logger');

/* This is a JSON API: it serves no HTML, so the CSP only needs to deny
   everything rather than describe a page. */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'none'"],
      'form-action': ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: env.NODE_ENV === 'production'
    ? { maxAge: 15_552_000, includeSubDomains: true, preload: false }
    : false,
});

/* Origin allowlist. A request with no Origin header (curl, a server-side
   call, a Razorpay webhook) is allowed through - CORS is a browser
   protection, and blocking those would break the webhook. */
const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);

    /* Any localhost port is fine while developing, so nobody has to edit
       .env to change a dev server's port. */
    if (env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    logger.warn('Blocked cross-origin request', { origin });
    return callback(new Error('Origin not allowed by CORS'));
  },
  /* PATCH and Authorization are the admin panel's; the storefront uses
     neither. */
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Requested-With', 'Authorization'],
  credentials: false,
  maxAge: 86_400,
});

module.exports = { helmetMiddleware, corsMiddleware, hppMiddleware: hpp() };
