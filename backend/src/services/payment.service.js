/* =====================================================================
   Razorpay.

   Three things matter here and they are the difference between taking
   money and losing it:

   1. The checkout signature proves the browser's success callback really
      came from Razorpay - HMAC-SHA256 of "<order_id>|<payment_id>" with
      the key secret.
   2. A valid signature is still not enough. We then fetch the payment
      from Razorpay's API and reconcile it against OUR stored order:
      same razorpay order id, same amount, same currency, captured
      status. Signature alone would let someone pay ₹1 for a ₹1,650 order
      by pairing a real cheap payment with a real order id.
   3. Webhook signatures are computed over the RAW request body. Parse
      the JSON first and the bytes change and every signature fails.
   ===================================================================== */
'use strict';

const crypto = require('crypto');
const { razorpay } = require('../config/razorpay');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/* ── Constant-time comparison ─────────────────────────────────────── */

/**
 * Compares two hex digests without leaking, through timing, how many
 * leading characters matched. Length is compared first because
 * timingSafeEqual throws on a length mismatch.
 */
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hmacHex(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/* ── 1. Create a Razorpay order ───────────────────────────────────── */

/**
 * `amountPaise` comes from the pricing service only.
 * The receipt carries our own order number so a Razorpay dashboard row
 * can always be traced back to a document in our database.
 */
async function createRazorpayOrder({ amountPaise, orderNumber, customerName, phone, itemSummary }) {
  if (!Number.isInteger(amountPaise) || amountPaise < 100) {
    throw ApiError.internal('Refusing to open a payment for an invalid amount.');
  }

  try {
    const rzpOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: orderNumber,          // max 40 chars; ours is 16
      payment_capture: 1,            // auto-capture on authorisation
      notes: {
        orderNumber,
        customerName: String(customerName).slice(0, 40),
        phone: String(phone).slice(0, 15),
        items: String(itemSummary).slice(0, 200),
      },
    });

    logger.info('Razorpay order created', {
      orderNumber,
      razorpayOrderId: rzpOrder.id,
      amountPaise,
    });

    return rzpOrder;
  } catch (err) {
    logger.error('Razorpay order creation failed', {
      orderNumber,
      statusCode: err?.statusCode,
      description: err?.error?.description,
    });
    throw ApiError.payment(
      'We could not open the payment window. Please try again, or message us on WhatsApp and we will take the order manually.'
    );
  }
}

/* ── 2. Verify the checkout callback signature ────────────────────── */

function verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  const expected = hmacHex(`${razorpayOrderId}|${razorpayPaymentId}`, env.RAZORPAY_KEY_SECRET);
  return safeCompare(expected, signature);
}

/* ── 3. Fetch and reconcile the payment ───────────────────────────── */

async function fetchPayment(paymentId) {
  try {
    return await razorpay.payments.fetch(paymentId);
  } catch (err) {
    logger.error('Razorpay payment fetch failed', {
      paymentId,
      statusCode: err?.statusCode,
      description: err?.error?.description,
    });
    throw ApiError.payment('We could not confirm this payment with Razorpay. Please do not pay again - message us and we will check.');
  }
}

/**
 * The check that makes a forged-but-valid pairing useless.
 * Every field must line up with the order we stored before checkout.
 */
function reconcilePayment({ payment, order }) {
  const problems = [];

  if (payment.order_id !== order.payment.razorpayOrderId) {
    problems.push(`order_id mismatch: payment ${payment.order_id} vs stored ${order.payment.razorpayOrderId}`);
  }
  if (Number(payment.amount) !== order.amounts.totalPaise) {
    problems.push(`amount mismatch: paid ${payment.amount} vs owed ${order.amounts.totalPaise}`);
  }
  if (payment.currency !== order.amounts.currency) {
    problems.push(`currency mismatch: ${payment.currency} vs ${order.amounts.currency}`);
  }
  if (!['captured', 'authorized'].includes(payment.status)) {
    problems.push(`payment status is ${payment.status}`);
  }

  return { ok: problems.length === 0, problems };
}

/* ── 4. Webhook signature over the raw body ───────────────────────── */

/**
 * `rawBody` MUST be the exact Buffer Razorpay sent. Re-serialising a
 * parsed object changes key order and whitespace and the HMAC will never
 * match.
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!rawBody || !signature) return false;
  const expected = hmacHex(rawBody.toString('utf8'), env.RAZORPAY_WEBHOOK_SECRET);
  return safeCompare(expected, signature);
}

/* ── 5. Refunds ───────────────────────────────────────────────────── */

async function refundPayment({ paymentId, amountPaise, orderNumber, reason }) {
  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: amountPaise,
      speed: 'normal',
      notes: { orderNumber, reason: String(reason || 'customer request').slice(0, 200) },
    });
    logger.info('Refund initiated', { orderNumber, paymentId, refundId: refund.id, amountPaise });
    return refund;
  } catch (err) {
    logger.error('Refund failed', {
      orderNumber,
      paymentId,
      statusCode: err?.statusCode,
      description: err?.error?.description,
    });
    throw ApiError.payment('The refund could not be initiated. Please contact support.');
  }
}

/** A one-way digest, so a database dump cannot be replayed at /verify. */
function digestSignature(signature) {
  return crypto.createHash('sha256').update(String(signature)).digest('hex');
}

module.exports = {
  createRazorpayOrder,
  verifyCheckoutSignature,
  fetchPayment,
  reconcilePayment,
  verifyWebhookSignature,
  refundPayment,
  digestSignature,
  safeCompare,
  hmacHex,
};
