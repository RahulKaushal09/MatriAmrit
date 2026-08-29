#!/usr/bin/env node
/* =====================================================================
   One-time backfill: give every order placed before dispatch tracking
   existed a fulfilment record.

     npm run backfill:fulfilment

   Idempotent - orders that already have the field are left alone, so
   running it twice costs nothing. A paid order that clearly went out
   long ago is still marked "pending": this script knows what was
   shipped only from the database, and inventing a dispatch date would
   be worse than an operator ticking it off.
   ===================================================================== */
'use strict';

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const Order = require('../src/models/Order');

async function main() {
  await connectDatabase();

  const filter = { fulfilment: mongoose.trusted({ $exists: false }) };
  const pending = await Order.countDocuments(filter);

  if (pending === 0) {
    console.log('\n✓ Every order already has a fulfilment record. Nothing to do.\n');
    await disconnectDatabase();
    return;
  }

  const result = await Order.updateMany(filter, {
    $set: { fulfilment: { status: 'pending', history: [] } },
  });

  console.log(`\n✓ Backfilled ${result.modifiedCount} of ${pending} order(s) as "pending".\n`);
  await disconnectDatabase();
}

main().catch(async err => {
  console.error('\n✗ Backfill failed:', err.message, '\n');
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
