'use strict';

const orderService = require('../services/order.service');
const { reverseGeocode } = require('../services/geocode.service');
const asyncHandler = require('../middleware/asyncHandler');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/** POST /orders - price it, store it, open a Razorpay order. */
const createOrder = asyncHandler(async (req, res) => {
  /* Honeypot: a real customer never sees this field, let alone fills it. */
  if (req.body.website) {
    logger.warn('Honeypot triggered on order creation', { requestId: req.id });
    throw ApiError.badRequest('Your booking could not be submitted.');
  }

  const result = await orderService.createOrder({
    payload: req.body,
    ipHash: req.ipHash,
    userAgent: req.get('user-agent'),
  });

  res.status(201).json({ success: true, data: result });
});

/** POST /orders/:orderNumber/verify - the checkout success callback. */
const verifyPayment = asyncHandler(async (req, res) => {
  const { alreadyVerified, order } = await orderService.verifyPayment({
    orderNumber: req.params.orderNumber,
    razorpayOrderId: req.body.razorpay_order_id,
    razorpayPaymentId: req.body.razorpay_payment_id,
    signature: req.body.razorpay_signature,
  });

  res.json({
    success: true,
    data: {
      verified: true,
      alreadyVerified,
      order: order.toPublicJSON(),
    },
  });
});

/** POST /orders/:orderNumber/payment-failed - dismissed or declined. */
const recordFailure = asyncHandler(async (req, res) => {
  const order = await orderService.recordPaymentFailure({
    orderNumber: req.params.orderNumber,
    razorpayPaymentId: req.body.razorpay_payment_id,
    reason: req.body.reason,
  });

  res.json({
    success: true,
    data: { orderNumber: order.orderNumber, status: order.status },
  });
});

/** GET /orders/:orderNumber?phoneLast4=1234 - customer-facing status. */
const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderForCustomer({
    orderNumber: req.params.orderNumber,
    phoneLast4: req.query.phoneLast4,
  });

  res.json({ success: true, data: { order: order.toPublicJSON() } });
});

/** GET /orders/geo/reverse?lat=&lng= - Leaflet pin -> a readable address. */
const reverse = asyncHandler(async (req, res) => {
  const result = await reverseGeocode({ lat: req.query.lat, lng: req.query.lng });
  res.json({ success: true, data: result });
});

module.exports = { createOrder, verifyPayment, recordFailure, getOrder, reverse };
