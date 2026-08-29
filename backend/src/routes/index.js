'use strict';

const express = require('express');
const mongoose = require('mongoose');
const catalogueRoutes = require('./catalogue.routes');
const orderRoutes = require('./order.routes');
const adminRoutes = require('./admin.routes');

const router = express.Router();

/* Liveness + readiness in one. A load balancer can watch the status
   code; a human can read the body. */
router.get('/health', (_req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  const healthy = dbState === 1;
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'ok' : 'degraded',
      database: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

router.use('/catalogue', catalogueRoutes);
router.use('/orders', orderRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
