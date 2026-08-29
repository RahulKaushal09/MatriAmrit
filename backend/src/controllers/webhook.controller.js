/* =====================================================================
   Razorpay webhook receiver.

   `req.body` here is a raw Buffer, mounted with express.raw() before the
   JSON parser, because the signature is computed over the exact bytes
   sent. Parsing first would change them and every signature would fail.
   ===================================================================== */
'use strict';

const paymentService = require('../services/payment.service');
const { processWebhook } = require('../services/webhook.service');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../utils/logger');

const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  const eventId = req.get('x-razorpay-event-id');

  if (!signature || !eventId) {
    logger.warn('Webhook missing signature or event id');
    return res.status(400).json({ success: false, error: { message: 'Missing webhook headers' } });
  }

  if (!Buffer.isBuffer(req.body)) {
    logger.error('Webhook body is not raw - check middleware order in app.js');
    return res.status(500).json({ success: false, error: { message: 'Webhook misconfigured' } });
  }

  if (!paymentService.verifyWebhookSignature(req.body, signature)) {
    logger.error('Webhook signature verification FAILED', { eventId });
    /* 400, not 401 - and deliberately no detail about why. */
    return res.status(400).json({ success: false, error: { message: 'Invalid signature' } });
  }

  let parsed;
  try {
    parsed = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, error: { message: 'Invalid JSON' } });
  }

  try {
    const result = await processWebhook({ parsed, eventId });
    /* Always 200 once the signature is good: a non-2xx makes Razorpay
       retry, and retrying will not fix a business-logic mismatch. */
    return res.status(200).json({ success: true, received: true, duplicate: Boolean(result.duplicate) });
  } catch (err) {
    /* A genuine server fault - here a retry IS worth having. */
    logger.error('Webhook processing threw', { eventId, message: err.message });
    return res.status(500).json({ success: false, error: { message: 'Processing error' } });
  }
});

module.exports = { razorpayWebhook };
