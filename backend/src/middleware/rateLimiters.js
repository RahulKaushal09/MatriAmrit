/* =====================================================================
   Rate limits.

   Tiered rather than global: reading the catalogue is cheap, creating an
   order costs us a Razorpay API call, and verification is the endpoint
   an attacker would hammer to brute-force a signature.
   ===================================================================== */
'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const handler = (_req, _res, next) => next(ApiError.tooMany('Too many requests. Please wait a moment and try again.'));

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  /* The integration suite places dozens of orders from one address in a
     few seconds. Counting those would make the suite fail on its own
     thoroughness rather than on a real defect. */
  skip: () => env.NODE_ENV === 'test',
};

/** Blanket ceiling for the whole API. */
const globalLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 600,
});

/** Placing an order hits Razorpay's API, so it is kept deliberately tight. */
const createOrderLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 12,
  message: 'Too many booking attempts from this device.',
});

/** Signature verification - the brute-force surface. */
const verifyLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 30,
});

/** Live totals + coupon codes. Generous enough for a customer editing a
    basket, tight enough that coupon codes cannot be enumerated. */
const quoteLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 60,
});

/** Order lookup by number + phone - guessing surface. */
const lookupLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 40,
});

/** Admin sign-in: the endpoint a password list would be pointed at. The
    account lock in the Admin model catches a slow grind against one
    username; this catches a fast one across many. */
const adminLoginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
});

/** Nominatim asks for no more than one request per second, per policy. */
const geocodeLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 20,
});

module.exports = {
  globalLimiter,
  quoteLimiter,
  createOrderLimiter,
  verifyLimiter,
  lookupLimiter,
  geocodeLimiter,
  adminLoginLimiter,
};
