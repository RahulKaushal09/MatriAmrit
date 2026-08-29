/* =====================================================================
   THE CATALOGUE - server-side source of truth for pricing.

   The browser sends only { productId, variantId, quantity }. Every rupee
   charged is computed from this file. A tampered request that claims a
   ₹1 laddu is priced from here and charged ₹1,450 regardless.

   The frontend keeps its own copy in js/catalogue.js for display and
   images. If you change a price, change BOTH - and the server's number
   is the one that is actually charged.
   ===================================================================== */
'use strict';

const { rupeesToPaise } = require('../utils/money');

/* Prices below are written in rupees for human review and converted to
   paise once, here, at module load. */
const RAW_PRODUCTS = [
  {
    id: 'oorja-shakti-laddu',
    name: 'Oorja Shakti Laddu',
    devanagari: 'ऊर्जा शक्ति लड्डू',
    tagline: 'Bala Poshanam · For Every Generation',
    audience: 'For growing children and senior members of the family.',
    ratePerKg: 1450,
    active: true,
    /* 1 kg is the smallest box we make - there is no sub-kilo variant.
       2 kg is priced at the same rate per kg, not discounted. */
    variants: [
      { id: 'oorja-1kg', label: '1 kg', grams: 1000, price: 1450, active: true },
      { id: 'oorja-2kg', label: '2 kg', grams: 2000, price: 2900, active: true },
    ],
  },
  {
    id: 'matra-shakti-laddu',
    name: 'Matra Shakti Laddu',
    devanagari: 'मातृ शक्ति लड्डू',
    tagline: 'For Mothers · The Sutika Period',
    audience: 'Traditional postpartum nourishment for new mothers.',
    ratePerKg: 1650,
    active: true,
    variants: [
      { id: 'matra-1kg', label: '1 kg', grams: 1000, price: 1650, active: true },
      { id: 'matra-2kg', label: '2 kg', grams: 2000, price: 3300, active: true },
    ],
  },
];

/* Freeze the shape and precompute paise so nothing downstream can mutate
   a price by accident. */
const PRODUCTS = RAW_PRODUCTS.map(p =>
  Object.freeze({
    ...p,
    ratePerKgPaise: rupeesToPaise(p.ratePerKg),
    variants: Object.freeze(
      p.variants.map(v =>
        Object.freeze({ ...v, pricePaise: rupeesToPaise(v.price) })
      )
    ),
  })
);

const PRODUCT_BY_ID = new Map(PRODUCTS.map(p => [p.id, p]));

const VARIANT_INDEX = new Map();
for (const product of PRODUCTS) {
  for (const variant of product.variants) {
    // Namespaced so a variant id can never be resolved against the wrong product.
    VARIANT_INDEX.set(`${product.id}::${variant.id}`, { product, variant });
  }
}

function getProduct(productId) {
  return PRODUCT_BY_ID.get(productId) || null;
}

/** Resolves a line to its authoritative product + variant, or null. */
function resolveVariant(productId, variantId) {
  return VARIANT_INDEX.get(`${productId}::${variantId}`) || null;
}

/** The shape sent to the browser - no internal fields, no surprises. */
function publicCatalogue() {
  return PRODUCTS.filter(p => p.active).map(p => ({
    id: p.id,
    name: p.name,
    devanagari: p.devanagari,
    tagline: p.tagline,
    audience: p.audience,
    ratePerKgPaise: p.ratePerKgPaise,
    variants: p.variants
      .filter(v => v.active)
      .map(v => ({
        id: v.id,
        label: v.label,
        grams: v.grams,
        pricePaise: v.pricePaise,
      })),
  }));
}

module.exports = { PRODUCTS, getProduct, resolveVariant, publicCatalogue };
