'use strict';

const { publicCatalogue } = require('../data/catalogue');
const { priceOrder } = require('../services/pricing.service');
const { publicCoupon } = require('../services/coupon.service');
const env = require('../config/env');
const asyncHandler = require('../middleware/asyncHandler');

/** GET /catalogue - the authoritative prices, for display and cross-check. */
const getCatalogue = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: {
      products: publicCatalogue(),
      delivery: {
        feePaise: env.DELIVERY_FEE_PAISE,
        freeAbovePaise: env.FREE_DELIVERY_ABOVE_PAISE,
      },
      limits: {
        maxUnitsPerLine: env.MAX_UNITS_PER_LINE,
        maxLinesPerOrder: env.MAX_LINES_PER_ORDER,
      },
    },
  });
});

/** POST /catalogue/quote - live totals while the customer edits
    quantities or tries a coupon code.

    A bad coupon does not fail the quote: the basket is re-priced without
    it and the reason is returned alongside, so the summary keeps showing
    real money while the customer fixes the code. Order creation is the
    gate that actually refuses - see order.service. */
const quote = asyncHandler(async (req, res) => {
  const { items, couponCode } = req.body;

  let priced;
  let couponError = null;

  try {
    priced = priceOrder(items, couponCode);
  } catch (err) {
    if (!couponCode || err.code !== 'COUPON_INVALID') throw err;
    couponError = { code: couponCode, message: err.message };
    priced = priceOrder(items);
  }

  res.json({
    success: true,
    data: {
      items: priced.items,
      amounts: priced.amounts,
      totalGrams: priced.totalGrams,
      coupon: publicCoupon(priced.coupon, priced.amounts.discountPaise),
      couponError,
      freeDeliveryThresholdPaise: priced.freeDeliveryThresholdPaise,
      amountToFreeDeliveryPaise: priced.amountToFreeDeliveryPaise,
    },
  });
});

module.exports = { getCatalogue, quote };
