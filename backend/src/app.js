// src/app.js
'use strict';

const express = require('express');
const compression = require('compression');

const env = require('./config/env');
const routes = require('./routes');
const webhookRoutes = require('./routes/webhook.routes');
const requestContext = require('./middleware/requestContext');
const sanitize = require('./middleware/sanitize');
const {
  helmetMiddleware,
  corsMiddleware,
  hppMiddleware
} = require('./middleware/security');
const { globalLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');
app.set('etag', false);

app.use(requestContext);
app.use(helmetMiddleware);
app.use(corsMiddleware);

// IMPORTANT: webhook before express.json()
app.use(`${env.API_PREFIX}/webhooks`, webhookRoutes);

app.use(express.json({ limit: '64kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

app.use(sanitize);
app.use(hppMiddleware);
app.use(compression());

app.use(env.API_PREFIX, globalLimiter, routes);

app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: 'MatriAmrit API',
      version: '1.0.0',
      health: `${env.API_PREFIX}/health`
    }
  });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;