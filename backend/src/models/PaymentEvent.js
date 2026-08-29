/* =====================================================================
   PaymentEvent - the webhook ledger.

   Razorpay retries a webhook until it gets a 2xx, so the same event can
   arrive many times. Every event is written here first with a unique
   index on the provider's event id; a duplicate insert throws E11000 and
   we acknowledge without re-processing. That is what makes capture
   idempotent.
   ===================================================================== */
'use strict';

const mongoose = require('mongoose');

const paymentEventSchema = new mongoose.Schema(
  {
    /* Razorpay's `x-razorpay-event-id` header - unique per event, stable
       across retries of that same event. */
    eventId: { type: String, required: true, unique: true, immutable: true },
    event: { type: String, required: true, index: true },

    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String, default: null, index: true },
    orderNumber: { type: String, default: null, index: true },

    status: {
      type: String,
      enum: ['received', 'processed', 'ignored', 'error'],
      default: 'received',
      index: true,
    },
    handledAt: { type: Date, default: null },
    error: { type: String, default: null },

    /* Kept for reconciliation and dispute evidence. */
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true, strict: true, minimize: false }
);

/* Webhook payloads are only useful for a while - expire them after 180
   days so the collection does not grow without bound. */
paymentEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

module.exports = mongoose.model('PaymentEvent', paymentEventSchema);
