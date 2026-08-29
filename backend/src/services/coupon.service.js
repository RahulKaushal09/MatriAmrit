/* =====================================================================
   Coupons.

   Decides whether a typed code applies to a basket and what it is worth.
   Rounding always favours the shop - a fraction of a paisa is never
   handed out - and a discount can never exceed what is being discounted.
   ===================================================================== */
'use strict';

const { resolveCoupon, normaliseCode } = require('../data/coupons');
const { getProduct } = require('../data/catalogue');
const { formatPaise } = require('../utils/money');
const ApiError = require('../utils/ApiError');

/* One message for "no such code" and for "retired code", so the endpoint
   cannot be used to sift real codes out of guesses. */
const UNKNOWN = 'That coupon code is not valid.';

const invalid = message => ApiError.unprocessable(message, { code: 'COUPON_INVALID' });

/** Human list: "Matra Shakti Laddu" / "A and B" / "A, B and C". */
function nameList(productIds) {
  const names = productIds.map(id => getProduct(id)?.name || id);
  if (names.length <= 1) return names[0] || 'selected products';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Prices a coupon against already-priced lines.
 *
 * @param {object}   args
 * @param {string}   args.code            what the customer typed
 * @param {Array}    args.items           priced lines from the pricing service
 * @param {number}   args.subtotalPaise   the whole basket, before discount
 * @param {Date}     [args.now]
 * @returns {{ coupon: object, discountPaise: number }}
 * @throws {ApiError} 422 with code COUPON_INVALID and a reason a customer can act on
 */
function evaluateCoupon({ code, items, subtotalPaise, now = new Date() }) {
  const coupon = resolveCoupon(code);
  if (!coupon || !coupon.active) throw invalid(UNKNOWN);

  const at = now.getTime();
  if (coupon.startsAtMs !== null && at < coupon.startsAtMs) {
    throw invalid('That coupon is not live yet.');
  }
  if (coupon.endsAtMs !== null && at >= coupon.endsAtMs) {
    throw invalid('That coupon has expired.');
  }

  /* What the discount is computed on. A product-scoped coupon discounts
     only its own lines, never the rest of the basket. */
  const eligiblePaise = coupon.appliesTo
    ? items
        .filter(i => coupon.appliesTo.includes(i.productId))
        .reduce((sum, i) => sum + i.lineTotalPaise, 0)
    : subtotalPaise;

  if (eligiblePaise <= 0) {
    throw invalid(`This coupon applies to ${nameList(coupon.appliesTo)} only.`);
  }

  if (subtotalPaise < coupon.minSubtotalPaise) {
    throw invalid(
      `This coupon needs an order of ${formatPaise(coupon.minSubtotalPaise)} or more. ` +
      `Add ${formatPaise(coupon.minSubtotalPaise - subtotalPaise)} more to use it.`
    );
  }

  let discountPaise =
    coupon.type === 'percent'
      ? Math.floor((eligiblePaise * coupon.value) / 100)
      : coupon.flatValuePaise;

  if (coupon.maxDiscountPaise !== null) {
    discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise);
  }

  /* Never more than the goods it applies to, and never a negative bill. */
  discountPaise = Math.min(discountPaise, eligiblePaise, subtotalPaise);

  if (discountPaise <= 0) throw invalid('This coupon is worth nothing on this order.');

  return {
    coupon: {
      code: coupon.code,
      label: coupon.label,
      type: coupon.type,
      maxRedemptions: coupon.maxRedemptions,
    },
    discountPaise,
  };
}

/**
 * Redemption cap. Counts orders that actually got paid, so an abandoned
 * checkout never burns someone else's coupon.
 *
 * Two customers paying in the same instant can push a code one past its
 * cap; the alternative is holding a lock across a payment window, which
 * costs far more than the odd extra discount.
 */
async function assertRedeemable(coupon, OrderModel) {
  if (!coupon || coupon.maxRedemptions === null || coupon.maxRedemptions === undefined) return;

  const used = await OrderModel.countDocuments({ 'coupon.code': coupon.code, status: 'paid' });
  if (used >= coupon.maxRedemptions) {
    throw invalid('This coupon has been fully claimed.');
  }
}

/** The only shape of a coupon the browser ever sees. Internals - the
    redemption cap in particular - stay on this side. */
function publicCoupon(coupon, discountPaise) {
  if (!coupon) return null;
  return { code: coupon.code, label: coupon.label, discountPaise };
}

module.exports = { evaluateCoupon, assertRedeemable, publicCoupon, normaliseCode };
