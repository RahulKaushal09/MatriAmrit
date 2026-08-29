// src/server.js
'use strict';

const env = require('./config/env');
const app = require('./app');
const logger = require('./utils/logger');
const {
  connectDatabase,
  disconnectDatabase
} = require('./config/database');

let server = null;
let shuttingDown = false;

async function start() {
  await connectDatabase();

  server = app.listen(env.PORT, () => {
    logger.info('MatriAmrit API listening', {
      port: env.PORT,
      env: env.NODE_ENV,
      prefix: env.API_PREFIX,
      razorpayMode: env.RAZORPAY_KEY_ID.startsWith('rzp_live_')
        ? 'LIVE'
        : 'test',
    });
  });

  server.headersTimeout = 20_000;
  server.requestTimeout = 20_000;
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`${signal} received, shutting down`);

  const force = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 15_000);

  force.unref();

  try {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }

    await disconnectDatabase();

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', {
      message: err.message
    });

    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', reason => {
  logger.error('Unhandled promise rejection', {
    reason: String(reason)
  });

  shutdown('unhandledRejection');
});

process.on('uncaughtException', err => {
  logger.error('Uncaught exception', {
    message: err.message,
    stack: err.stack
  });

  shutdown('uncaughtException');
});

start().catch(err => {
  logger.error('Failed to start', {
    message: err.message,
    stack: err.stack
  });

  process.exit(1);
});