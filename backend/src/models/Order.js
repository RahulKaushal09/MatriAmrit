/* =====================================================================
   Order.

   One document per booking. Amounts are stored in paise as integers and
   are written only by the pricing service - never from request input.
   ===================================================================== */
'use strict';

const mongoose = require('mongoose');

const ORDER_STATUSES = [
  'created',    // saved, Razorpay order opened, awaiting payment
  'paid',       // payment verified and reconciled
  'failed',     // payment attempted and declined
  'cancelled',  // abandoned or cancelled before payment
  'refunded',   // fully refunded after payment
];

/* Which transitions are legal. Anything not listed is rejected, so a
   replayed webhook can never walk a refunded order back to "paid". */
const ALLOWED_TRANSITIONS = Object.freeze({
  created: ['paid', 'failed', 'cancelled'],
  failed: ['paid', 'cancelled'],   // a customer may retry and succeed
  paid: ['refunded'],
  cancelled: [],
  refunded: [],
});

const itemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    variantId: { type: String, required: true },
    name: { type: String, required: true },
    variantLabel: { type: String, required: true },
    grams: { type: Number, required: true, min: 1 },
    quantity: { type: Number, required: true, min: 1 },
    unitPricePaise: { type: Number, required: true, min: 0 },
    lineTotalPaise: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

/* A snapshot of the coupon as it was priced. Stored rather than looked
   up later, so retiring or re-pricing a code never rewrites history on
   an order that has already been paid for. */
const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 24 },
    label: { type: String, required: true, maxlength: 120 },
    type: { type: String, required: true, enum: ['percent', 'flat'] },
    discountPaise: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    razorpayPaymentId: { type: String, default: null },
    status: { type: String, required: true },   // 'failed' | 'verified' | 'dismissed'
    reason: { type: String, default: null },
    source: { type: String, default: 'checkout' }, // 'checkout' | 'webhook'
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/* Dispatch progress. Deliberately separate from `status`: `status` is
   what the money did, this is what the box did. An order can be paid and
   still sitting on the packing table. */
const FULFILMENT_STATUSES = ['pending', 'packed', 'dispatched', 'delivered'];

const fulfilmentSchema = new mongoose.Schema(
  {
    status: { type: String, enum: FULFILMENT_STATUSES, default: 'pending' },
    courier: { type: String, default: null, trim: true, maxlength: 80 },
    trackingRef: { type: String, default: null, trim: true, maxlength: 80 },
    note: { type: String, default: null, trim: true, maxlength: 300 },
    packedAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    history: {
      type: [
        new mongoose.Schema(
          {
            from: String,
            to: String,
            by: String,          // the admin username, for accountability
            note: { type: String, default: null },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, immutable: true },

    status: { type: String, enum: ORDER_STATUSES, default: 'created', index: true },

    customer: {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      /* Stored as a bare 10-digit Indian mobile number. */
      phone: { type: String, required: true, match: /^[6-9]\d{9}$/, index: true },
      phoneLast4: { type: String, required: true, match: /^\d{4}$/ },
      email: { type: String, default: null, lowercase: true, trim: true, maxlength: 120 },
      whatsappSameAsPhone: { type: Boolean, default: true },
      whatsappPhone: { type: String, default: null, match: /^[6-9]\d{9}$/ },
    },

    delivery: {
      addressLine: { type: String, required: true, trim: true, maxlength: 300 },
      landmark: { type: String, default: null, trim: true, maxlength: 120 },
      city: { type: String, required: true, trim: true, maxlength: 60 },
      state: { type: String, required: true, trim: true, maxlength: 60 },
      pincode: { type: String, required: true, match: /^[1-9]\d{5}$/ },
      /* GeoJSON, only when the customer dropped a pin on the map.
         Order is [longitude, latitude] - GeoJSON, not the lat,lng that
         Leaflet uses. */
      location: {
        type: {
          type: String,
          enum: ['Point'],
          default: undefined,
        },
        coordinates: {
          type: [Number],
          default: undefined,
          validate: {
            validator: c => !c || (c.length === 2
              && c[0] >= -180 && c[0] <= 180
              && c[1] >= -90 && c[1] <= 90),
            message: 'coordinates must be [longitude, latitude] within valid bounds',
          },
        },
      },
      geocodedLabel: { type: String, default: null, maxlength: 300 },
      locationSource: { type: String, enum: ['manual', 'pin'], default: 'manual' },
    },

    items: {
      type: [itemSchema],
      required: true,
      validate: { validator: v => v.length > 0, message: 'An order needs at least one item' },
    },

    amounts: {
      subtotalPaise: { type: Number, required: true, min: 0 },
      discountPaise: { type: Number, required: true, min: 0, default: 0 },
      deliveryFeePaise: { type: Number, required: true, min: 0 },
      totalPaise: { type: Number, required: true, min: 1 },
      currency: { type: String, default: 'INR', enum: ['INR'] },
    },

    /* null unless a coupon was applied and honoured by the pricing
       service. Indexed because the redemption cap counts on it. */
    coupon: { type: couponSchema, default: null },

    payment: {
      provider: { type: String, default: 'razorpay' },
      razorpayOrderId: { type: String, default: null },
      razorpayPaymentId: { type: String, default: null },
      /* The signature is never stored in the clear - only a digest, so a
         leaked dump cannot be replayed against our verify endpoint. */
      signatureDigest: { type: String, default: null },
      method: { type: String, default: null },       // upi | card | netbanking | wallet
      capturedAt: { type: Date, default: null },
      refundId: { type: String, default: null },
      refundedAt: { type: Date, default: null },
      failureReason: { type: String, default: null },
      attempts: { type: [attemptSchema], default: [] },
    },

    fulfilment: { type: fulfilmentSchema, default: () => ({}) },

    customerNote: { type: String, default: null, trim: true, maxlength: 500 },

    /* Non-PII request fingerprint, useful for abuse investigation. */
    meta: {
      ipHash: { type: String, default: null },
      userAgent: { type: String, default: null, maxlength: 300 },
    },

    statusHistory: {
      type: [
        new mongoose.Schema(
          {
            from: String,
            to: String,
            reason: String,
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    strict: 'throw',       // an unknown field is a bug, not something to ignore
    minimize: false,
    versionKey: '__v',
  }
);

/* A Razorpay order id must map to exactly one of our orders. `sparse`
   keeps the many nulls from colliding before checkout opens. */
orderSchema.index({ 'payment.razorpayOrderId': 1 }, { unique: true, sparse: true });
orderSchema.index({ 'payment.razorpayPaymentId': 1 }, { sparse: true });
orderSchema.index({ 'coupon.code': 1, status: 1 }, { sparse: true });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'fulfilment.status': 1, createdAt: -1 });
orderSchema.index({ 'delivery.location': '2dsphere' }, { sparse: true });

orderSchema.methods.canTransitionTo = function canTransitionTo(next) {
  if (this.status === next) return false;
  return (ALLOWED_TRANSITIONS[this.status] || []).includes(next);
};

/** Applies a guarded status change and records why. Returns false if illegal. */
orderSchema.methods.applyStatus = function applyStatus(next, reason) {
  if (!this.canTransitionTo(next)) return false;
  this.statusHistory.push({ from: this.status, to: next, reason: reason || null, at: new Date() });
  this.status = next;
  return true;
};

/** The safe projection - what a customer is allowed to see back. */
orderSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    orderNumber: this.orderNumber,
    status: this.status,
    placedAt: this.createdAt,
    customer: {
      name: this.customer.name,
      phoneMasked: `••••••${this.customer.phoneLast4}`,
      email: this.customer.email,
    },
    delivery: {
      addressLine: this.delivery.addressLine,
      landmark: this.delivery.landmark,
      city: this.delivery.city,
      state: this.delivery.state,
      pincode: this.delivery.pincode,
      hasPin: Boolean(this.delivery.location && this.delivery.location.coordinates),
      geocodedLabel: this.delivery.geocodedLabel,
    },
    items: this.items.map(i => ({
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      variantLabel: i.variantLabel,
      quantity: i.quantity,
      unitPricePaise: i.unitPricePaise,
      lineTotalPaise: i.lineTotalPaise,
    })),
    amounts: {
      subtotalPaise: this.amounts.subtotalPaise,
      discountPaise: this.amounts.discountPaise || 0,
      deliveryFeePaise: this.amounts.deliveryFeePaise,
      totalPaise: this.amounts.totalPaise,
      currency: this.amounts.currency,
    },
    coupon: this.coupon
      ? { code: this.coupon.code, label: this.coupon.label, discountPaise: this.coupon.discountPaise }
      : null,
    fulfilment: {
      status: this.fulfilment?.status || 'pending',
      courier: this.fulfilment?.courier || null,
      trackingRef: this.fulfilment?.trackingRef || null,
      dispatchedAt: this.fulfilment?.dispatchedAt || null,
      deliveredAt: this.fulfilment?.deliveredAt || null,
    },
    payment: {
      status: this.status === 'paid' ? 'captured' : this.status,
      method: this.payment.method,
      paymentId: this.payment.razorpayPaymentId,
      capturedAt: this.payment.capturedAt,
    },
    customerNote: this.customerNote,
  };
};

/* Everything an admin needs to pack and dispatch, including the fields
   the customer projection deliberately masks. Never reachable without a
   valid admin token. */
orderSchema.methods.toAdminJSON = function toAdminJSON() {
  return {
    orderNumber: this.orderNumber,
    status: this.status,
    placedAt: this.createdAt,
    updatedAt: this.updatedAt,
    customer: {
      name: this.customer.name,
      phone: this.customer.phone,
      whatsappPhone: this.customer.whatsappSameAsPhone
        ? this.customer.phone
        : this.customer.whatsappPhone,
      whatsappSameAsPhone: this.customer.whatsappSameAsPhone,
      email: this.customer.email,
    },
    delivery: {
      addressLine: this.delivery.addressLine,
      landmark: this.delivery.landmark,
      city: this.delivery.city,
      state: this.delivery.state,
      pincode: this.delivery.pincode,
      geocodedLabel: this.delivery.geocodedLabel,
      locationSource: this.delivery.locationSource,
      coordinates: this.delivery.location?.coordinates || null,   // [lng, lat]
    },
    items: this.items.map(i => ({
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      variantLabel: i.variantLabel,
      grams: i.grams,
      quantity: i.quantity,
      unitPricePaise: i.unitPricePaise,
      lineTotalPaise: i.lineTotalPaise,
    })),
    totalGrams: this.items.reduce((sum, i) => sum + i.grams * i.quantity, 0),
    amounts: {
      subtotalPaise: this.amounts.subtotalPaise,
      discountPaise: this.amounts.discountPaise || 0,
      deliveryFeePaise: this.amounts.deliveryFeePaise,
      totalPaise: this.amounts.totalPaise,
      currency: this.amounts.currency,
    },
    coupon: this.coupon
      ? { code: this.coupon.code, label: this.coupon.label, discountPaise: this.coupon.discountPaise }
      : null,
    payment: {
      method: this.payment.method,
      razorpayOrderId: this.payment.razorpayOrderId,
      razorpayPaymentId: this.payment.razorpayPaymentId,
      capturedAt: this.payment.capturedAt,
      refundId: this.payment.refundId,
      refundedAt: this.payment.refundedAt,
      failureReason: this.payment.failureReason,
      attempts: this.payment.attempts.map(a => ({
        razorpayPaymentId: a.razorpayPaymentId,
        status: a.status,
        reason: a.reason,
        source: a.source,
        at: a.at,
      })),
    },
    fulfilment: {
      status: this.fulfilment?.status || 'pending',
      courier: this.fulfilment?.courier || null,
      trackingRef: this.fulfilment?.trackingRef || null,
      note: this.fulfilment?.note || null,
      packedAt: this.fulfilment?.packedAt || null,
      dispatchedAt: this.fulfilment?.dispatchedAt || null,
      deliveredAt: this.fulfilment?.deliveredAt || null,
      history: (this.fulfilment?.history || []).map(h => ({
        from: h.from, to: h.to, by: h.by, note: h.note, at: h.at,
      })),
    },
    customerNote: this.customerNote,
    statusHistory: this.statusHistory.map(h => ({
      from: h.from, to: h.to, reason: h.reason, at: h.at,
    })),
  };
};

/** The row shape for the admin list - enough to triage, not the lot. */
orderSchema.methods.toAdminSummaryJSON = function toAdminSummaryJSON() {
  return {
    orderNumber: this.orderNumber,
    status: this.status,
    fulfilmentStatus: this.fulfilment?.status || 'pending',
    placedAt: this.createdAt,
    customerName: this.customer.name,
    phone: this.customer.phone,
    city: this.delivery.city,
    pincode: this.delivery.pincode,
    totalPaise: this.amounts.totalPaise,
    discountPaise: this.amounts.discountPaise || 0,
    couponCode: this.coupon ? this.coupon.code : null,
    itemCount: this.items.reduce((sum, i) => sum + i.quantity, 0),
    itemSummary: this.items.map(i => `${i.quantity}× ${i.name} ${i.variantLabel}`).join(', '),
    totalGrams: this.items.reduce((sum, i) => sum + i.grams * i.quantity, 0),
    paymentMethod: this.payment.method,
  };
};

module.exports = mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.FULFILMENT_STATUSES = FULFILMENT_STATUSES;
module.exports.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
