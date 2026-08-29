/* =====================================================================
   Webhook route.

   express.raw() is mounted HERE, on this route only, so the signature
   can be checked against the exact bytes Razorpay sent. Every other
   route still gets a normal parsed JSON body.
   ===================================================================== */
'use strict';

const express = require('express');
const controller = require('../controllers/webhook.controller');

const router = express.Router();

router.post(
  '/razorpay',
  express.raw({ type: 'application/json', limit: '256kb' }),
  controller.razorpayWebhook
);

module.exports = router;
