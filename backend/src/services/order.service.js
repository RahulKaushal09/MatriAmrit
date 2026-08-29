/* =====================================================================
   Order orchestration.

   Owns the sequence: price -> persist -> open a Razorpay order -> verify
   -> settle. Controllers stay thin; the rules live here.
   ===================================================================== */
'use strict';

const Order = require('../models/Order');
const paymentService = require('./payment.service');
const { priceOrder } = require('./pricing.service');
const { assertRedeemable, publicCoupon } = require('./coupon.service');
const { generateOrderNumber } = require('../utils/orderNumber');
const { publicKeyId } = require('../config/razorpay');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/* An order number collision is astronomically unlikely, but a retry loop
   costs nothing and removes the failure mode entirely. */
const MAX_ORDER_NUMBER_ATTEMPTS = 5;

function buildItemSummary(items) {
  return items.map(i => `${i.quantity}x ${i.name} ${i.variantLabel}`).join(', ');
}

/* ── Create ───────────────────────────────────────────────────────── */

async function createOrder({ payload, ipHash, userAgent }) {
  /* 1. Price it from the server catalogue, coupon included. Anything the
        client claimed about money is not even read. An unusable coupon
        throws here rather than being quietly dropped, so nobody is
        charged full price expecting a discount. */
  const priced = priceOrder(payload.items, payload.couponCode);

  /* A capped coupon is counted only here. The quote endpoint deliberately
     does not, so the check happens once, at the moment of purchase. */
  await assertRedeemable(priced.coupon, Order);

  const { customer, delivery } = payload;

  /* 2. Persist before touching Razorpay. If the gateway call fails we
        still hold a record of what the customer tried to buy. */
  const doc = {
    status: 'created',
    customer: {
      name: customer.name,
      phone: customer.phone,
      phoneLast4: customer.phone.slice(-4),
      email: customer.email || null,
      whatsappSameAsPhone: customer.whatsappSameAsPhone !== false,
      whatsappPhone: customer.whatsappSameAsPhone === false ? customer.whatsappPhone : null,
    },
    delivery: {
      addressLine: delivery.addressLine,
      landmark: delivery.landmark || null,
      city: delivery.city,
      state: delivery.state,
      pincode: delivery.pincode,
      geocodedLabel: delivery.location?.label || null,
      locationSource: delivery.location ? 'pin' : 'manual',
      ...(delivery.location
        ? {
            /* GeoJSON is [lng, lat]; Leaflet hands us lat, lng. */
            location: { type: 'Point', coordinates: [delivery.location.lng, delivery.location.lat] },
          }
        : {}),
    },
    items: priced.items,
    amounts: priced.amounts,
    coupon: priced.coupon
      ? {
          code: priced.coupon.code,
          label: priced.coupon.label,
          type: priced.coupon.type,
          discountPaise: priced.amounts.discountPaise,
        }
      : null,
    customerNote: payload.customerNote || null,
    meta: { ipHash, userAgent: userAgent ? String(userAgent).slice(0, 300) : null },
    statusHistory: [{ from: 'new', to: 'created', reason: 'Order placed', at: new Date() }],
  };

  let order = null;
  for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      order = await Order.create({ ...doc, orderNumber: generateOrderNumber() });
      break;
    } catch (err) {
      const isDuplicateOrderNumber = err?.code === 11000 && err?.keyPattern?.orderNumber;
      if (!isDuplicateOrderNumber || attempt === MAX_ORDER_NUMBER_ATTEMPTS) throw err;
      logger.warn('Order number collision, retrying', { attempt });
    }
  }

  /* 3. Open the Razorpay order for exactly the amount we computed. */
  let rzpOrder;
  try {
    rzpOrder = await paymentService.createRazorpayOrder({
      amountPaise: order.amounts.totalPaise,
      orderNumber: order.orderNumber,
      customerName: order.customer.name,
      phone: order.customer.phone,
      itemSummary: buildItemSummary(order.items),
    });
  } catch (err) {
    order.applyStatus('failed', 'Could not open payment gateway');
    order.payment.failureReason = 'gateway_unavailable';
    await order.save();
    throw err;
  }

  order.payment.razorpayOrderId = rzpOrder.id;
  await order.save();

  /* 4. Hand the browser only what Razorpay Checkout needs. The key
        SECRET is never part of this. */
  return {
    orderNumber: order.orderNumber,
    amounts: order.amounts,
    coupon: publicCoupon(order.coupon, order.amounts.discountPaise),
    items: order.items.map(i => ({
      name: i.name,
      variantLabel: i.variantLabel,
      quantity: i.quantity,
      unitPricePaise: i.unitPricePaise,
      lineTotalPaise: i.lineTotalPaise,
    })),
    razorpay: {
      keyId: publicKeyId,
      orderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
    },
    prefill: {
      name: order.customer.name,
      contact: order.customer.phone,
      email: order.customer.email || '',
    },
  };
}

/* ── Verify ───────────────────────────────────────────────────────── */

async function verifyPayment({ orderNumber, razorpayOrderId, razorpayPaymentId, signature }) {
  const order = await Order.findOne({ orderNumber });
  if (!order) throw ApiError.notFound('We could not find that order.');

  /* Idempotent: a double-submitted callback returns the same success. */
  if (order.status === 'paid' && order.payment.razorpayPaymentId === razorpayPaymentId) {
    return { alreadyVerified: true, order };
  }

  if (order.payment.razorpayOrderId !== razorpayOrderId) {
    logger.error('Razorpay order id does not belong to this order', { orderNumber });
    throw ApiError.badRequest('This payment does not belong to that order.');
  }

  /* Gate 1 - the signature. */
  const signatureValid = paymentService.verifyCheckoutSignature({
    razorpayOrderId,
    razorpayPaymentId,
    signature,
  });

  if (!signatureValid) {
    order.payment.attempts.push({
      razorpayPaymentId,
      status: 'failed',
      reason: 'signature_mismatch',
      source: 'checkout',
    });
    await order.save();
    logger.error('Payment signature verification FAILED', { orderNumber, razorpayPaymentId });
    throw ApiError.badRequest('We could not verify this payment. If money has left your account, message us and we will resolve it.');
  }

  /* Gate 2 - reconcile against Razorpay's own record of the payment. */
  const payment = await paymentService.fetchPayment(razorpayPaymentId);
  const { ok, problems } = paymentService.reconcilePayment({ payment, order });

  if (!ok) {
    order.payment.attempts.push({
      razorpayPaymentId,
      status: 'failed',
      reason: `reconciliation_failed: ${problems.join('; ')}`,
      source: 'checkout',
    });
    await order.save();
    logger.error('Payment reconciliation FAILED', { orderNumber, razorpayPaymentId, problems });
    throw ApiError.payment('This payment did not match the order. Our team has been alerted - please do not pay again.');
  }

  /* Settled. */
  order.payment.razorpayPaymentId = payment.id;
  order.payment.signatureDigest = paymentService.digestSignature(signature);
  order.payment.method = payment.method || null;
  order.payment.capturedAt = payment.captured ? new Date() : null;
  order.payment.attempts.push({ razorpayPaymentId, status: 'verified', source: 'checkout' });
  order.applyStatus('paid', 'Signature verified and reconciled with Razorpay');
  await order.save();

  logger.info('Payment verified', { orderNumber, method: payment.method });
  return { alreadyVerified: false, order };
}

/* ── Failure / abandonment ────────────────────────────────────────── */

async function recordPaymentFailure({ orderNumber, razorpayPaymentId, reason }) {
  const order = await Order.findOne({ orderNumber });
  if (!order) throw ApiError.notFound('We could not find that order.');

  /* Never overwrite a successful payment with a late failure callback. */
  if (order.status === 'paid') return order;

  order.payment.attempts.push({
    razorpayPaymentId: razorpayPaymentId || null,
    status: 'failed',
    reason: reason ? String(reason).slice(0, 300) : 'checkout_dismissed_or_failed',
    source: 'checkout',
  });
  order.payment.failureReason = reason ? String(reason).slice(0, 300) : 'payment_not_completed';
  /* Stay in `created` so the customer can retry from the same order. */
  await order.save();
  return order;
}

/* ── Lookup ───────────────────────────────────────────────────────── */

async function getOrderForCustomer({ orderNumber, phoneLast4 }) {
  const order = await Order.findOne({ orderNumber });

  /* Same response either way, so this endpoint cannot be used to
     discover which order numbers exist. */
  if (!order || !paymentService.safeCompare(order.customer.phoneLast4, phoneLast4)) {
    throw ApiError.notFound('No order matches that number and phone.');
  }
  return order;
}

module.exports = {
  createOrder,
  verifyPayment,
  recordPaymentFailure,
  getOrderForCustomer,
  buildItemSummary,
};
