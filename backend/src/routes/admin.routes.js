'use strict';

const express = require('express');
const controller = require('../controllers/admin.controller');
const validate = require('../middleware/validate');
const limiters = require('../middleware/rateLimiters');
const { requireAdmin } = require('../middleware/adminAuth');
const {
  loginSchema,
  listQuerySchema,
  orderNumberParamSchema,
  fulfilmentSchema,
} = require('../validators/admin.validator');

const router = express.Router();

/* Public: the only door in. Rate limited hard - this is the endpoint
   someone would point a password list at. */
router.post('/login', limiters.adminLoginLimiter, validate({ body: loginSchema }), controller.login);

/* Everything below needs a valid token. */
router.use(requireAdmin);

router.get('/me', controller.me);
router.post('/logout-everywhere', controller.logoutEverywhere);
router.get('/stats', controller.stats);

router.get('/orders', validate({ query: listQuerySchema }), controller.listOrders);
router.get('/orders/:orderNumber', validate({ params: orderNumberParamSchema }), controller.getOrder);

router.patch(
  '/orders/:orderNumber/fulfilment',
  validate({ params: orderNumberParamSchema, body: fulfilmentSchema }),
  controller.updateFulfilment
);

module.exports = router;
