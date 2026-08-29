/* =====================================================================
   MongoDB connection.

   `strictQuery` keeps stray filter keys from silently matching every
   document, which is the difference between "no results" and "we just
   returned every customer's phone number".
   ===================================================================== */
'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

async function connectDatabase() {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', err => logger.error('MongoDB error', { message: err.message }));

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 10,
    autoIndex: env.NODE_ENV !== 'production', // build indexes explicitly in prod
  });

  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close(false);
}

module.exports = { connectDatabase, disconnectDatabase };
