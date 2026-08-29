/* =====================================================================
   COUPONS - server-side source of truth for discounts.

   The browser sends a code, nothing more. Whether that code exists, is
   live today, applies to what is in the basket and what it is worth are
   all decided here. A tampered request that claims "₹1,400 off" is
   priced from this file and gets exactly what the code below allows.

   Discounts are written in rupees for human review and converted to
   paise once, at module load.
   ===================================================================== */
'use strict';

const { rupeesToPaise } = require('../utils/money');

/* Field reference
   ───────────────
   code            What the customer types. Uppercase A-Z, 0-9 and '-'.
   label           Shown in the summary once applied.
   type            'percent' - `value` is a percentage of the eligible amount
                   'flat'    - `value` is a rupee amount off
   value           Percentage (1-100) or rupees, per `type`.
   maxDiscount     Rupee ceiling for a percentage coupon. null = uncapped.
   minSubtotal     Rupees the basket must reach before the code applies.
   appliesTo       Product ids the discount is computed on. null = all.
   startsAt/endsAt ISO dates, inclusive of start, exclusive of end.
                   null = no bound on that side.
   maxRedemptions  How many PAID orders may use it. null = unlimited.
   active          The master switch. Set false to retire a code without
                   deleting it, so old orders keep their label.           */
const RAW_COUPONS = [
  {
    code: 'WELCOME10',
    label: '10% off your first box',
    type: 'percent',
    value: 10,
    maxDiscount: 200,
    minSubtotal: 1450,
    appliesTo: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    active: true,
  },
  {
    code: 'MATRA150',
    label: '₹150 off Matra Shakti Laddu',
    type: 'flat',
    value: 150,
    maxDiscount: null,
    minSubtotal: 1650,
    appliesTo: ['matra-shakti-laddu'],
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    active: true,
  },
  {
    code: 'FESTIVE250',
    label: '₹250 off orders above ₹2,900',
    type: 'flat',
    value: 250,
    maxDiscount: null,
    minSubtotal: 2900,
    appliesTo: null,
    startsAt: null,
    endsAt: '2026-12-31',
    maxRedemptions: 500,
    active: true,
  },
];

/* A code is matched case-insensitively and with stray spaces ignored -
   people paste them out of WhatsApp messages. */
function normaliseCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

const COUPONS = RAW_COUPONS.map(c =>
  Object.freeze({
    ...c,
    code: normaliseCode(c.code),
    maxDiscountPaise: c.maxDiscount === null ? null : rupeesToPaise(c.maxDiscount),
    minSubtotalPaise: rupeesToPaise(c.minSubtotal || 0),
    flatValuePaise: c.type === 'flat' ? rupeesToPaise(c.value) : null,
    appliesTo: c.appliesTo ? Object.freeze([...c.appliesTo]) : null,
    startsAtMs: c.startsAt ? Date.parse(c.startsAt) : null,
    endsAtMs: c.endsAt ? Date.parse(c.endsAt) : null,
  })
);

/* Fail at boot, not during someone's checkout. */
for (const c of COUPONS) {
  if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(c.code)) {
    throw new Error(`Coupon "${c.code}" is not a usable code (3-24 chars, A-Z 0-9 -)`);
  }
  if (c.type === 'percent' && !(c.value > 0 && c.value <= 100)) {
    throw new Error(`Coupon ${c.code}: a percent value must be between 1 and 100`);
  }
  if (c.type === 'flat' && !(c.flatValuePaise > 0)) {
    throw new Error(`Coupon ${c.code}: a flat value must be more than zero`);
  }
  if (c.startsAt && Number.isNaN(c.startsAtMs)) throw new Error(`Coupon ${c.code}: unreadable startsAt`);
  if (c.endsAt && Number.isNaN(c.endsAtMs)) throw new Error(`Coupon ${c.code}: unreadable endsAt`);
}

const COUPON_BY_CODE = new Map(COUPONS.map(c => [c.code, c]));

if (COUPON_BY_CODE.size !== COUPONS.length) {
  throw new Error('Two coupons share the same code');
}

/** The coupon for a typed code, or null. Retired codes still resolve so
    the service can say "expired" rather than "never existed". */
function resolveCoupon(rawCode) {
  return COUPON_BY_CODE.get(normaliseCode(rawCode)) || null;
}

module.exports = { COUPONS, resolveCoupon, normaliseCode };
