/* =====================================================================
   Express application.

   Middleware ORDER is load-bearing. In particular the webhook router is
   mounted BEFORE express.json(), because its signature must be verified
   against the raw request bytes. Move it below the JSON parser and every
   webhook will fail signature verification.
   ===================================================================== */
'use strict';

const express = require('express');
const compression = require('compression');

const env = require('./config/env');
const routes = require('./routes');
const webhookRoutes = require('./routes/webhook.routes');
const requestContext = require('./middleware/requestContext');
const sanitize = require('./middleware/sanitize');
const { helmetMiddleware, corsMiddleware, hppMiddleware } = require('./middleware/security');
const { globalLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

/* Behind a proxy, req.ip must come from X-Forwarded-For or every client
   shares one rate-limit bucket. Left off by default: trusting the header
   when there is no proxy lets anyone spoof their IP. */
app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');
app.set('etag', false);

/* 1. Request id, hashed client fingerprint, access log. */
app.use(requestContext);

/* 2. Security headers + origin allowlist. */
app.use(helmetMiddleware);
app.use(corsMiddleware);

/* 3. Webhooks - MUST precede express.json(). Not rate-limited: Razorpay
      retries legitimately and a throttled webhook loses a paid order. */
app.use(`${env.API_PREFIX}/webhooks`, webhookRoutes);

/* 4. Body parsing, deliberately small. No order is anywhere near 64kb. */
app.use(express.json({ limit: '64kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

/* 5. Strip Mongo operators, then duplicate query params. */
app.use(sanitize);
app.use(hppMiddleware);

app.use(compression());

/* 6. Blanket rate limit, then the API. */
app.use(env.API_PREFIX, globalLimiter, routes);

/* A bare GET / is useful when someone opens the API host in a browser. */
app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: { service: 'MatriAmrit API', version: '1.0.0', health: `${env.API_PREFIX}/health` },
  });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
