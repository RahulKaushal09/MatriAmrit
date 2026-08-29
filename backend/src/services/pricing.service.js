/* =====================================================================
   Pricing.

   The single place where an amount is decided. Input is what the
   customer chose; output is what we charge. Nothing here reads a price
   from the request.
   ===================================================================== */
'use strict';

const env = require('../config/env');
const { resolveVariant } = require('../data/catalogue');
const { evaluateCoupon } = require('./coupon.service');
const ApiError = require('../utils/ApiError');
const { assertPaise } = require('../utils/money');

/**
 * Prices a list of { productId, variantId, quantity }, optionally with a
 * coupon code. Throws ApiError for anything unorderable so the customer
 * gets a real reason rather than a silently dropped line.
 *
 * @param {Array}  requestedItems
 * @param {string} [couponCode] what the customer typed, unvalidated
 */
function priceOrder(requestedItems, couponCode = null) {
  const items = [];
  let subtotalPaise = 0;
  let totalGrams = 0;

  for (const requested of requestedItems) {
    const match = resolveVariant(requested.productId, requested.variantId);

    if (!match) {
      throw ApiError.unprocessable(
        'One of the items is no longer available. Please refresh the page and try again.',
        { details: [{ field: 'items', message: `Unknown item ${requested.productId}/${requested.variantId}` }] }
      );
    }

    const { product, variant } = match;

    if (!product.active || !variant.active) {
      throw ApiError.unprocessable(`${product.name} (${variant.label}) is not available right now.`);
    }

    const quantity = requested.quantity;
    const unitPricePaise = variant.pricePaise;
    const lineTotalPaise = unitPricePaise * quantity;

    subtotalPaise += lineTotalPaise;
    totalGrams += variant.grams * quantity;

    items.push({
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      variantLabel: variant.label,
      grams: variant.grams,
      quantity,
      unitPricePaise,
      lineTotalPaise,
    });
  }

  const deliveryFeePaise =
    subtotalPaise >= env.FREE_DELIVERY_ABOVE_PAISE ? 0 : env.DELIVERY_FEE_PAISE;

  /* The coupon is priced last, against lines this file just computed -
     never against a figure the browser sent. An unusable code throws, so
     the customer is told why rather than quietly charged full price. */
  let coupon = null;
  let discountPaise = 0;

  if (couponCode) {
    const applied = evaluateCoupon({ code: couponCode, items, subtotalPaise });
    coupon = applied.coupon;
    discountPaise = applied.discountPaise;
  }

  const totalPaise = subtotalPaise + deliveryFeePaise - discountPaise;

  assertPaise(subtotalPaise, 'subtotal');
  assertPaise(deliveryFeePaise, 'deliveryFee');
  assertPaise(discountPaise, 'discount');
  assertPaise(totalPaise, 'total');

  if (totalPaise < 100) {
    throw ApiError.unprocessable(
      coupon
        ? 'That coupon leaves too little to charge. Please remove it or add another box.'
        : 'Order total is below the minimum we can process.'
    );
  }
  if (totalPaise > env.MAX_ORDER_VALUE_PAISE) {
    throw ApiError.unprocessable(
      'This order is larger than we can take online. Please message us on WhatsApp and we will arrange it.'
    );
  }

  return {
    items,
    totalGrams,
    coupon,
    amounts: {
      subtotalPaise,
      discountPaise,
      deliveryFeePaise,
      totalPaise,
      currency: 'INR',
    },
    /* Both are zero while delivery is included in the box price. Kept so
       the shape stays stable if a delivery charge is ever introduced. */
    freeDeliveryThresholdPaise: env.FREE_DELIVERY_ABOVE_PAISE,
    amountToFreeDeliveryPaise: Math.max(0, env.FREE_DELIVERY_ABOVE_PAISE - subtotalPaise),
  };
}

module.exports = { priceOrder };
