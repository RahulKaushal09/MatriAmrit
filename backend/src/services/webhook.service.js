/* =====================================================================
   Webhook processing.

   Why this exists: a customer can pay and then close the tab before the
   browser calls /verify. The money is taken; our database still says
   "created". Razorpay's webhook is the authoritative channel that
   settles those orders regardless of what the browser did.

   Idempotency is enforced by a unique index on eventId - we insert the
   event first, and a duplicate key error means "already handled".
   ===================================================================== */
'use strict';

const Order = require('../models/Order');
const PaymentEvent = require('../models/PaymentEvent');
const paymentService = require('./payment.service');
const logger = require('../utils/logger');

const HANDLED_EVENTS = new Set([
  'payment.captured',
  'payment.failed',
  'order.paid',
  'refund.processed',
]);

/**
 * Claims an event id. Returns null when this event was already recorded,
 * which is the signal to acknowledge and do nothing.
 */
async function claimEvent({ eventId, event, payload, ids }) {
  try {
    return await PaymentEvent.create({
      eventId,
      event,
      razorpayOrderId: ids.razorpayOrderId,
      razorpayPaymentId: ids.razorpayPaymentId,
      orderNumber: ids.orderNumber,
      payload,
      status: 'received',
    });
  } catch (err) {
    if (err?.code === 11000) {
      logger.info('Duplicate webhook event ignored', { eventId, event });
      return null;
    }
    throw err;
  }
}

/** Finds our order from whatever identifiers the event carries. */
async function findOrder({ razorpayOrderId, orderNumber }) {
  if (razorpayOrderId) {
    const byRzp = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId });
    if (byRzp) return byRzp;
  }
  if (orderNumber) return Order.findOne({ orderNumber });
  return null;
}

/* ── Individual handlers ──────────────────────────────────────────── */

async function handlePaymentCaptured(payment) {
  const order = await findOrder({
    razorpayOrderId: payment.order_id,
    orderNumber: payment.notes?.orderNumber,
  });

  if (!order) {
    logger.error('Webhook capture for an unknown order', { razorpayOrderId: payment.order_id });
    return { status: 'ignored', reason: 'order_not_found' };
  }

  if (order.status === 'paid') return { status: 'ignored', reason: 'already_paid', order };

  /* The same reconciliation the browser path performs - a webhook is
     authenticated, but the amount still has to match. */
  const { ok, problems } = paymentService.reconcilePayment({ payment, order });
  if (!ok) {
    logger.error('Webhook reconciliation failed', { orderNumber: order.orderNumber, problems });
    order.payment.attempts.push({
      razorpayPaymentId: payment.id,
      status: 'failed',
      reason: `webhook_reconciliation_failed: ${problems.join('; ')}`,
      source: 'webhook',
    });
    await order.save();
    return { status: 'error', reason: 'reconciliation_failed', order };
  }

  order.payment.razorpayPaymentId = payment.id;
  order.payment.method = payment.method || null;
  order.payment.capturedAt = new Date((payment.created_at || Date.now() / 1000) * 1000);
  order.payment.attempts.push({
    razorpayPaymentId: payment.id,
    status: 'verified',
    source: 'webhook',
  });
  order.applyStatus('paid', 'Captured via Razorpay webhook');
  await order.save();

  logger.info('Order settled by webhook', { orderNumber: order.orderNumber });
  return { status: 'processed', order };
}

async function handlePaymentFailed(payment) {
  const order = await findOrder({
    razorpayOrderId: payment.order_id,
    orderNumber: payment.notes?.orderNumber,
  });
  if (!order) return { status: 'ignored', reason: 'order_not_found' };
  if (order.status === 'paid') return { status: 'ignored', reason: 'already_paid', order };

  order.payment.attempts.push({
    razorpayPaymentId: payment.id,
    status: 'failed',
    reason: payment.error_description || payment.error_reason || 'payment_failed',
    source: 'webhook',
  });
  order.payment.failureReason = payment.error_description || 'payment_failed';
  await order.save();

  return { status: 'processed', order };
}

async function handleRefundProcessed(refund) {
  const order = await Order.findOne({ 'payment.razorpayPaymentId': refund.payment_id });
  if (!order) return { status: 'ignored', reason: 'order_not_found' };

  order.payment.refundId = refund.id;
  order.payment.refundedAt = new Date();

  /* Only a full refund closes the order; a partial one stays "paid". */
  if (Number(refund.amount) >= order.amounts.totalPaise) {
    order.applyStatus('refunded', `Refund ${refund.id} processed`);
  }
  await order.save();

  return { status: 'processed', order };
}

/* ── Entry point ──────────────────────────────────────────────────── */

/**
 * @param {object}  parsed   the webhook body, already JSON-parsed
 * @param {string}  eventId  the x-razorpay-event-id header
 */
async function processWebhook({ parsed, eventId }) {
  const event = parsed.event;
  const paymentEntity = parsed.payload?.payment?.entity || null;
  const orderEntity = parsed.payload?.order?.entity || null;
  const refundEntity = parsed.payload?.refund?.entity || null;

  const ids = {
    razorpayOrderId: paymentEntity?.order_id || orderEntity?.id || null,
    razorpayPaymentId: paymentEntity?.id || refundEntity?.payment_id || null,
    orderNumber: paymentEntity?.notes?.orderNumber || orderEntity?.notes?.orderNumber || null,
  };

  const record = await claimEvent({ eventId, event, payload: parsed, ids });
  if (!record) return { duplicate: true };

  if (!HANDLED_EVENTS.has(event)) {
    record.status = 'ignored';
    record.error = 'unhandled_event_type';
    record.handledAt = new Date();
    await record.save();
    return { duplicate: false, status: 'ignored' };
  }

  try {
    let result;
    switch (event) {
      case 'payment.captured':
        result = await handlePaymentCaptured(paymentEntity);
        break;
      case 'payment.failed':
        result = await handlePaymentFailed(paymentEntity);
        break;
      case 'order.paid':
        /* order.paid carries the payment entity too; treat it as a
           capture so a missed payment.captured is still covered. */
        result = paymentEntity
          ? await handlePaymentCaptured(paymentEntity)
          : { status: 'ignored', reason: 'no_payment_entity' };
        break;
      case 'refund.processed':
        result = await handleRefundProcessed(refundEntity);
        break;
      default:
        result = { status: 'ignored', reason: 'unhandled' };
    }

    record.status = result.status === 'processed' ? 'processed' : result.status;
    record.error = result.reason || null;
    record.orderNumber = result.order?.orderNumber || record.orderNumber;
    record.handledAt = new Date();
    await record.save();

    return { duplicate: false, ...result };
  } catch (err) {
    record.status = 'error';
    record.error = err.message?.slice(0, 500) || 'unknown';
    record.handledAt = new Date();
    await record.save();
    throw err;
  }
}

module.exports = { processWebhook, HANDLED_EVENTS };
