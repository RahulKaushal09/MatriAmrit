/* =====================================================================
   Catalogue drift check.

   The frontend keeps its own copy of the catalogue so product pages
   render instantly with no API call. That duplication is the one real
   risk in the design: a price edited in one file and not the other means
   the site advertises one number and charges another.

   Run this after any price change:  npm run check:catalogue
   ===================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

const server = require('../src/data/catalogue');

/* Evaluate the browser file in a sandbox with a fake `window`. */
const frontendPath = path.resolve(__dirname, '../../js/catalogue.js');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(frontendPath, 'utf8'), sandbox);
const frontend = sandbox.window.MATRIAMRIT_CATALOGUE;

const problems = [];
const serverProducts = server.publicCatalogue();

for (const sp of serverProducts) {
  const fp = frontend.getProduct(sp.id);
  if (!fp) { problems.push(`Frontend is missing product "${sp.id}"`); continue; }
  if (fp.name !== sp.name) problems.push(`${sp.id}: name differs ("${fp.name}" vs "${sp.name}")`);

  for (const sv of sp.variants) {
    const fv = fp.variants.find(v => v.id === sv.id);
    if (!fv) { problems.push(`${sp.id}: frontend is missing variant "${sv.id}"`); continue; }
    const frontendPaise = Math.round(fv.price * 100);
    if (frontendPaise !== sv.pricePaise) {
      problems.push(
        `${sp.id}/${sv.id}: PRICE MISMATCH - frontend shows ${frontendPaise} paise, server charges ${sv.pricePaise} paise`
      );
    }
    if (fv.grams !== sv.grams) problems.push(`${sp.id}/${sv.id}: grams differ (${fv.grams} vs ${sv.grams})`);
  }
}

for (const fp of frontend.products) {
  if (!serverProducts.find(p => p.id === fp.id)) {
    problems.push(`Frontend lists "${fp.id}", which the server will refuse to price`);
  }
}

/* Delivery rules are shown in the basket summary before the server quote
   arrives, so they have to agree too. */
const env = require('../src/config/env');
if (frontend.delivery.feePaise !== env.DELIVERY_FEE_PAISE) {
  problems.push(`Delivery fee differs: frontend ${frontend.delivery.feePaise}, server ${env.DELIVERY_FEE_PAISE}`);
}
if (frontend.delivery.freeAbovePaise !== env.FREE_DELIVERY_ABOVE_PAISE) {
  problems.push(`Free-delivery threshold differs: frontend ${frontend.delivery.freeAbovePaise}, server ${env.FREE_DELIVERY_ABOVE_PAISE}`);
}

if (problems.length) {
  console.error('\n✗ Catalogue drift detected:\n' + problems.map(p => `  • ${p}`).join('\n') + '\n');
  process.exit(1);
}

const variantCount = serverProducts.reduce((n, p) => n + p.variants.length, 0);
console.log(`✓ Catalogue in sync - ${serverProducts.length} products, ${variantCount} variants, prices match.`);
