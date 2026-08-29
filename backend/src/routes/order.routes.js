'use strict';

const express = require('express');
const controller = require('../controllers/order.controller');
const validate = require('../middleware/validate');
const limiters = require('../middleware/rateLimiters');
const {
  createOrderSchema,
  verifyPaymentSchema,
  paymentFailedSchema,
  orderNumberParamSchema,
  lookupQuerySchema,
  reverseGeocodeSchema,
} = require('../validators/order.validator');

const router = express.Router();

/* Declared before /:orderNumber so "geo" is never read as an order number. */
router.get(
  '/geo/reverse',
  limiters.geocodeLimiter,
  validate({ query: reverseGeocodeSchema }),
  controller.reverse
);

router.post(
  '/',
  limiters.createOrderLimiter,
  validate({ body: createOrderSchema }),
  controller.createOrder
);

router.post(
  '/:orderNumber/verify',
  limiters.verifyLimiter,
  validate({ params: orderNumberParamSchema, body: verifyPaymentSchema }),
  controller.verifyPayment
);

router.post(
  '/:orderNumber/payment-failed',
  limiters.verifyLimiter,
  validate({ params: orderNumberParamSchema, body: paymentFailedSchema }),
  controller.recordFailure
);

router.get(
  '/:orderNumber',
  limiters.lookupLimiter,
  validate({ params: orderNumberParamSchema, query: lookupQuerySchema }),
  controller.getOrder
);

module.exports = router;
