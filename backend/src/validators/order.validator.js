/* =====================================================================
   Request schemas.

   Note what is absent: no price, no total, no amount. The browser cannot
   send money. It sends what was chosen and who to deliver it to; the
   server decides what that costs.
   ===================================================================== */
'use strict';

const { z } = require('zod');
const env = require('../config/env');
const { ORDER_NUMBER_PATTERN } = require('../utils/orderNumber');

/* ── Reusable field types ─────────────────────────────────────────── */

const trimmed = (min, max) => z.string().trim().min(min).max(max);

/* Indian mobile: ten digits starting 6-9. Tolerates the forms people
   actually type - +91, 0091, 0-prefixed, spaces, dashes - then stores
   the bare ten digits. */
const indianPhone = z
  .string()
  .trim()
  .transform(v => v.replace(/[\s\-()]/g, ''))
  .transform(v => v.replace(/^(\+91|0091|91|0)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'));

const pincode = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');

const optionalEmail = z
  .union([z.string().trim().max(120).email('Enter a valid email address'), z.literal('')])
  .optional()
  .transform(v => (v ? v.toLowerCase() : null));

/* A coupon code as typed: case and stray spaces are forgiven, then it
   must look like a code. Blank and absent both mean "no coupon". */
const couponCode = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .transform(v => v.toUpperCase().replace(/\s+/g, ''))
      .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,23}$/, 'That coupon code is not valid.')),
  ])
  .optional()
  .nullable()
  .transform(v => v || null);

const latitude = z.coerce.number().min(-90).max(90);
const longitude = z.coerce.number().min(-180).max(180);

/* ── Order line ───────────────────────────────────────────────────── */

const itemSchema = z.object({
  productId: trimmed(1, 60).regex(/^[a-z0-9-]+$/, 'Unknown product'),
  variantId: trimmed(1, 60).regex(/^[a-z0-9-]+$/, 'Unknown pack size'),
  quantity: z.coerce
    .number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(env.MAX_UNITS_PER_LINE, `Maximum ${env.MAX_UNITS_PER_LINE} packs of one size per order`),
});

/* ── Create an order ──────────────────────────────────────────────── */

const createOrderSchema = z.object({
  customer: z.object({
    name: trimmed(2, 80).regex(
      /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u,
      'Name may contain letters, spaces, apostrophes and hyphens only'
    ),
    phone: indianPhone,
    whatsappSameAsPhone: z.coerce.boolean().default(true),
    whatsappPhone: indianPhone.optional().nullable(),
    email: optionalEmail,
  }),

  delivery: z.object({
    addressLine: trimmed(8, 300),
    landmark: z.union([trimmed(0, 120), z.literal('')]).optional().transform(v => v || null),
    city: trimmed(2, 60),
    state: trimmed(2, 60),
    pincode,
    /* Present only when the customer dropped a Leaflet pin. */
    location: z
      .object({
        lat: latitude,
        lng: longitude,
        label: z.string().trim().max(300).optional().nullable(),
      })
      .optional()
      .nullable(),
  }),

  items: z
    .array(itemSchema)
    .min(1, 'Choose at least one product')
    .max(env.MAX_LINES_PER_ORDER, `Maximum ${env.MAX_LINES_PER_ORDER} different packs per order`),

  customerNote: z.union([z.string().trim().max(500), z.literal('')]).optional().transform(v => v || null),

  /* The code only. What it is worth is decided by the coupon service. */
  couponCode,

  /* Honeypot: a hidden field no human fills in. A bot that fills every
     input trips it and the request is rejected as spam. */
  website: z.literal('').optional(),
})
  .strict()
  .superRefine((data, ctx) => {
    if (!data.customer.whatsappSameAsPhone && !data.customer.whatsappPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customer', 'whatsappPhone'],
        message: 'Enter the WhatsApp number, or tick "same as my phone number"',
      });
    }

    /* One variant cannot appear twice - it would double-count silently. */
    const seen = new Set();
    data.items.forEach((item, index) => {
      const key = `${item.productId}::${item.variantId}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index],
          message: 'This pack size is already in your order - change its quantity instead',
        });
      }
      seen.add(key);
    });
  });

/* ── Quote (live totals as the customer edits) ────────────────────── */

const quoteSchema = z.object({
  items: z.array(itemSchema).min(1).max(env.MAX_LINES_PER_ORDER),
  couponCode,
}).strict();

/* ── Payment verification ─────────────────────────────────────────── */

const verifyPaymentSchema = z.object({
  razorpay_order_id: trimmed(5, 60).regex(/^order_[A-Za-z0-9]+$/, 'Malformed Razorpay order id'),
  razorpay_payment_id: trimmed(5, 60).regex(/^pay_[A-Za-z0-9]+$/, 'Malformed Razorpay payment id'),
  razorpay_signature: trimmed(20, 200).regex(/^[a-f0-9]+$/i, 'Malformed signature'),
}).strict();

const paymentFailedSchema = z.object({
  razorpay_order_id: trimmed(5, 60).optional().nullable(),
  razorpay_payment_id: trimmed(5, 60).optional().nullable(),
  reason: z.string().trim().max(300).optional().nullable(),
}).strict();

/* ── Params & lookup ──────────────────────────────────────────────── */

const orderNumberParamSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(ORDER_NUMBER_PATTERN, 'That order number does not look right'),
});

/* Knowing an order number is not enough to read an order: the last four
   digits of the phone on the order must match too. */
const lookupQuerySchema = z.object({
  phoneLast4: z.string().trim().regex(/^\d{4}$/, 'Enter the last 4 digits of the phone number used'),
}).strict();

const reverseGeocodeSchema = z.object({
  lat: latitude,
  lng: longitude,
}).strict();

module.exports = {
  createOrderSchema,
  quoteSchema,
  couponCode,
  verifyPaymentSchema,
  paymentFailedSchema,
  orderNumberParamSchema,
  lookupQuerySchema,
  reverseGeocodeSchema,
};
