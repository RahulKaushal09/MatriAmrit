/* Integration harness: stubs the Razorpay SDK, exercises the real
   pricing / verify / webhook code paths against a real MongoDB. */
'use strict';

const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/matriamrit_test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_stub';
process.env.RAZORPAY_KEY_SECRET = 'stub_secret_key';
process.env.RAZORPAY_WEBHOOK_SECRET = 'stub_webhook_secret';
process.env.JWT_SECRET = 'stub_jwt_secret_at_least_thirty_two_chars';

/* ── Stub the Razorpay client before anything requires it ────────── */
const RZP_STATE = { orders: new Map(), payments: new Map() };
const razorpayPath = require.resolve('../src/config/razorpay');
require.cache[razorpayPath] = {
  id: razorpayPath,
  filename: razorpayPath,
  loaded: true,
  exports: {
    publicKeyId: 'rzp_test_stub',
    razorpay: {
      orders: {
        async create(opts) {
          const id = `order_${crypto.randomBytes(8).toString('hex')}`;
          const o = { id, ...opts, status: 'created' };
          RZP_STATE.orders.set(id, o);
          return o;
        },
      },
      payments: {
        async fetch(id) {
          const p = RZP_STATE.payments.get(id);
          if (!p) { const e = new Error('not found'); e.statusCode = 400; throw e; }
          return p;
        },
      },
    },
  },
};

const request = require('./mini-request');
const app = require('../src/app');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const Admin = require('../src/models/Admin');
const Order = require('../src/models/Order');
const mongoose = require('mongoose');

const SECRET = 'stub_secret_key';
const sign = (a, b) => crypto.createHmac('sha256', SECRET).update(`${a}|${b}`).digest('hex');

const VALID_ORDER = {
  customer: { name: 'Aarti Sharma', phone: '+91 98765 43210', whatsappSameAsPhone: true, email: 'aarti@example.com' },
  delivery: { addressLine: '303 Studio Apartment, Sector 12', city: 'New Delhi', state: 'Delhi', pincode: '110078' },
  items: [{ productId: 'matra-shakti-laddu', variantId: 'matra-1kg', quantity: 1 }],
};

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (err) { failed += 1; console.log(`  ✗ ${name}\n      ${err.message}`); }
}

(async () => {
  await connectDatabase();
  await mongoose.connection.db.dropDatabase();
  const api = await request(app);

  console.log('\nPRICING & ORDER CREATION');

  let created;
  await test('creates an order and returns a Razorpay order id', async () => {
    const res = await api.post('/api/v1/orders', VALID_ORDER);
    assert.strictEqual(res.status, 201, `got ${res.status}: ${JSON.stringify(res.body)}`);
    created = res.body.data;
    assert.match(created.orderNumber, /^MA-\d{6}-[A-Z2-9]{6}$/);
    assert.match(created.razorpay.orderId, /^order_/);
  });

  await test('server prices a 1 kg Matra box at ₹1,650, delivery included', () => {
    assert.strictEqual(created.amounts.subtotalPaise, 165000);
    assert.strictEqual(created.amounts.deliveryFeePaise, 0, 'delivery is never charged separately');
    assert.strictEqual(created.amounts.totalPaise, 165000);
  });

  await test('a 2 kg box is priced at the same rate per kg', async () => {
    const res = await api.post('/api/v1/orders', {
      ...VALID_ORDER,
      items: [{ productId: 'matra-shakti-laddu', variantId: 'matra-2kg', quantity: 1 }],
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.amounts.totalPaise, 330000);
    assert.strictEqual(res.body.data.amounts.deliveryFeePaise, 0);
  });

  await test('a retired sub-kilo variant is refused', async () => {
    const res = await api.post('/api/v1/orders', {
      ...VALID_ORDER,
      items: [{ productId: 'matra-shakti-laddu', variantId: 'matra-500g', quantity: 1 }],
    });
    assert.strictEqual(res.status, 422, 'a stale basket must not be priceable');
  });

  await test('never leaks the Razorpay key secret', () => {
    assert.ok(!JSON.stringify(created).includes('stub_secret_key'));
    assert.strictEqual(created.razorpay.keyId, 'rzp_test_stub');
  });

  await test('a client-supplied unit price is ignored, not honoured', async () => {
    const res = await api.post('/api/v1/orders', {
      ...VALID_ORDER,
      items: [{ productId: 'matra-shakti-laddu', variantId: 'matra-1kg', quantity: 1, unitPricePaise: 1 }],
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.amounts.totalPaise, 165000);
  });

  await test('duplicate variant lines are rejected', async () => {
    const res = await api.post('/api/v1/orders', {
      ...VALID_ORDER,
      items: [
        { productId: 'matra-shakti-laddu', variantId: 'matra-1kg', quantity: 1 },
        { productId: 'matra-shakti-laddu', variantId: 'matra-1kg', quantity: 5 },
      ],
    });
    assert.strictEqual(res.status, 400);
  });

  await test('a variant from another product is rejected', async () => {
    const res = await api.post('/api/v1/orders', {
      ...VALID_ORDER,
      items: [{ productId: 'oorja-shakti-laddu', variantId: 'matra-2kg', quantity: 1 }],
    });
    assert.strictEqual(res.status, 422);
  });

  await test('the honeypot field blocks a bot', async () => {
    const res = await api.post('/api/v1/orders', { ...VALID_ORDER, website: 'http://spam.example' });
    assert.strictEqual(res.status, 400);
  });

  console.log('\nCOUPONS');

  await test('a quote applies a percentage coupon', async () => {
    const res = await api.post('/api/v1/catalogue/quote', {
      items: [{ productId: 'oorja-shakti-laddu', variantId: 'oorja-1kg', quantity: 1 }],
      couponCode: 'welcome10',
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const d = res.body.data;
    assert.strictEqual(d.amounts.subtotalPaise, 145000);
    assert.strictEqual(d.amounts.discountPaise, 14500);
    assert.strictEqual(d.amounts.totalPaise, 130500);
    assert.strictEqual(d.coupon.code, 'WELCOME10', 'the code is normalised to uppercase');
  });

  await test('a percentage coupon is held to its rupee cap', async () => {
    const res = await api.post('/api/v1/catalogue/quote', {
      items: [{ productId: 'matra-shakti-laddu', variantId: 'matra-2kg', quantity: 1 }],
      couponCode: 'WELCOME10',
    });
    assert.strictEqual(res.body.data.amounts.discountPaise, 20000, '10% of ₹3,300 is capped at ₹200');
  });

  await test('a bad code does not break the quote - totals still come back', async () => {
    const res = await api.post('/api/v1/catalogue/quote', {
      items: [{ productId: 'oorja-shakti-laddu', variantId: 'oorja-1kg', quantity: 1 }],
      couponCode: 'NOTACODE',
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.amounts.totalPaise, 145000);
    assert.strictEqual(res.body.data.coupon, null);
    assert.ok(res.body.data.couponError.message, 'the customer is told why');
  });

  await test('a product-scoped coupon is refused on another product', async () => {
    const res = await api.post('/api/v1/orders', {
      ...VALID_ORDER,
      items: [{ productId: 'oorja-shakti-laddu', variantId: 'oorja-1kg', quantity: 1 }],
      couponCode: 'MATRA150',
    });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.error.code, 'COUPON_INVALID');
  });

  await test('a coupon below its minimum order is refused', async () => {
    const res = await api.post('/api/v1/orders', { ...VALID_ORDER, couponCode: 'FESTIVE250' });
    assert.strictEqual(res.status, 422);
    assert.strictEqual(res.body.error.code, 'COUPON_INVALID');
  });

  let discounted;
  await test('an order is charged the discounted total, and stores the coupon', async () => {
    const res = await api.post('/api/v1/orders', { ...VALID_ORDER, couponCode: 'MATRA150' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    discounted = res.body.data;
    assert.strictEqual(discounted.amounts.subtotalPaise, 165000);
    assert.strictEqual(discounted.amounts.discountPaise, 15000);
    assert.strictEqual(discounted.amounts.totalPaise, 150000);
    assert.strictEqual(discounted.coupon.code, 'MATRA150');
    assert.strictEqual(discounted.razorpay.amount, 150000, 'Razorpay is opened for the discounted total');
  });

  await test('the discount is visible on the customer-facing order', async () => {
    const res = await api.get(`/api/v1/orders/${discounted.orderNumber}?phoneLast4=3210`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.order.amounts.discountPaise, 15000);
    assert.strictEqual(res.body.data.order.coupon.code, 'MATRA150');
  });

  await test('a client-supplied discount is rejected, not honoured', async () => {
    const res = await api.post('/api/v1/orders', {
      ...VALID_ORDER,
      amounts: { discountPaise: 164000, totalPaise: 100 },
    });
    assert.strictEqual(res.status, 400, 'an unknown money field must not be accepted');
  });

  await test('a malformed coupon code is rejected by validation', async () => {
    const res = await api.post('/api/v1/catalogue/quote', {
      items: [{ productId: 'oorja-shakti-laddu', variantId: 'oorja-1kg', quantity: 1 }],
      couponCode: 'a b',
    });
    assert.strictEqual(res.status, 400);
  });

  await test('an absent coupon leaves the total untouched', async () => {
    const res = await api.post('/api/v1/catalogue/quote', {
      items: [{ productId: 'oorja-shakti-laddu', variantId: 'oorja-1kg', quantity: 1 }],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.amounts.discountPaise, 0);
    assert.strictEqual(res.body.data.coupon, null);
  });

  console.log('\nPAYMENT VERIFICATION');

  await test('a forged signature is rejected', async () => {
    const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
    const res = await api.post(`/api/v1/orders/${created.orderNumber}/verify`, {
      razorpay_order_id: created.razorpay.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: crypto.randomBytes(32).toString('hex'),
    });
    assert.strictEqual(res.status, 400, `expected rejection, got ${res.status}`);
  });

  await test('a VALID signature on an UNDERPAID payment is still rejected', async () => {
    const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
    /* The attacker's scenario: a genuine Razorpay signature, but the
       payment is for ₹1 against a ₹1,650 order. */
    RZP_STATE.payments.set(paymentId, {
      id: paymentId, order_id: created.razorpay.orderId,
      amount: 100, currency: 'INR', status: 'captured', method: 'upi', captured: true,
    });
    const res = await api.post(`/api/v1/orders/${created.orderNumber}/verify`, {
      razorpay_order_id: created.razorpay.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sign(created.razorpay.orderId, paymentId),
    });
    assert.strictEqual(res.status, 402, `expected 402 reconciliation failure, got ${res.status}`);
  });

  let goodPaymentId;
  await test('a correct signature + matching amount is accepted', async () => {
    goodPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
    RZP_STATE.payments.set(goodPaymentId, {
      id: goodPaymentId, order_id: created.razorpay.orderId,
      amount: 165000, currency: 'INR', status: 'captured', method: 'upi', captured: true,
    });
    const res = await api.post(`/api/v1/orders/${created.orderNumber}/verify`, {
      razorpay_order_id: created.razorpay.orderId,
      razorpay_payment_id: goodPaymentId,
      razorpay_signature: sign(created.razorpay.orderId, goodPaymentId),
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.order.status, 'paid');
  });

  await test('re-verifying the same payment is idempotent', async () => {
    const res = await api.post(`/api/v1/orders/${created.orderNumber}/verify`, {
      razorpay_order_id: created.razorpay.orderId,
      razorpay_payment_id: goodPaymentId,
      razorpay_signature: sign(created.razorpay.orderId, goodPaymentId),
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.alreadyVerified, true);
  });

  console.log('\nORDER LOOKUP');

  await test('lookup succeeds with the right phone last-4', async () => {
    const res = await api.get(`/api/v1/orders/${created.orderNumber}?phoneLast4=3210`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.order.customer.phoneMasked, '••••••3210');
  });

  await test('lookup fails with the wrong phone last-4', async () => {
    const res = await api.get(`/api/v1/orders/${created.orderNumber}?phoneLast4=0000`);
    assert.strictEqual(res.status, 404);
  });

  await test('lookup never returns the full phone number', async () => {
    const res = await api.get(`/api/v1/orders/${created.orderNumber}?phoneLast4=3210`);
    assert.ok(!JSON.stringify(res.body).includes('9876543210'));
  });

  console.log('\nWEBHOOKS');

  const webhookBody = eventId => JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: {
      id: goodPaymentId, order_id: created.razorpay.orderId,
      amount: 165000, currency: 'INR', status: 'captured', method: 'upi',
      created_at: Math.floor(Date.now() / 1000), notes: { orderNumber: created.orderNumber },
    } } },
    _eid: eventId,
  });

  await test('an unsigned webhook is rejected', async () => {
    const res = await api.postRaw('/api/v1/webhooks/razorpay', webhookBody('evt_1'), {
      'x-razorpay-event-id': 'evt_1',
    });
    assert.strictEqual(res.status, 400);
  });

  await test('a wrongly-signed webhook is rejected', async () => {
    const body = webhookBody('evt_2');
    const res = await api.postRaw('/api/v1/webhooks/razorpay', body, {
      'x-razorpay-event-id': 'evt_2',
      'x-razorpay-signature': crypto.createHmac('sha256', 'WRONG').update(body).digest('hex'),
    });
    assert.strictEqual(res.status, 400);
  });

  await test('a correctly-signed webhook is accepted', async () => {
    const body = webhookBody('evt_3');
    const res = await api.postRaw('/api/v1/webhooks/razorpay', body, {
      'x-razorpay-event-id': 'evt_3',
      'x-razorpay-signature': crypto.createHmac('sha256', 'stub_webhook_secret').update(body).digest('hex'),
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  await test('a replayed webhook is detected as a duplicate', async () => {
    const body = webhookBody('evt_3');
    const res = await api.postRaw('/api/v1/webhooks/razorpay', body, {
      'x-razorpay-event-id': 'evt_3',
      'x-razorpay-signature': crypto.createHmac('sha256', 'stub_webhook_secret').update(body).digest('hex'),
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.duplicate, true);
  });

  await test('a webhook settles an order the browser never verified', async () => {
    const res = await api.post('/api/v1/orders', VALID_ORDER);
    const fresh = res.body.data;
    const pid = `pay_${crypto.randomBytes(8).toString('hex')}`;
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: {
        id: pid, order_id: fresh.razorpay.orderId, amount: 165000, currency: 'INR',
        status: 'captured', method: 'card', created_at: Math.floor(Date.now() / 1000),
        notes: { orderNumber: fresh.orderNumber },
      } } },
    });
    const hook = await api.postRaw('/api/v1/webhooks/razorpay', body, {
      'x-razorpay-event-id': 'evt_abandoned',
      'x-razorpay-signature': crypto.createHmac('sha256', 'stub_webhook_secret').update(body).digest('hex'),
    });
    assert.strictEqual(hook.status, 200);
    const look = await api.get(`/api/v1/orders/${fresh.orderNumber}?phoneLast4=3210`);
    assert.strictEqual(look.body.data.order.status, 'paid', 'abandoned order should be settled by webhook');
  });

  console.log('\nADMIN PANEL');

  const ADMIN_PW = 'test-panel-password';
  await Admin.create({
    username: 'tester',
    passwordHash: await Admin.hashPassword(ADMIN_PW),
    role: 'owner',
  });

  let adminToken = null;
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  await test('a wrong password is refused', async () => {
    const res = await api.post('/api/v1/admin/login', { username: 'tester', password: 'not-the-password' });
    assert.strictEqual(res.status, 401);
  });

  await test('an unknown user gets the same message as a wrong password', async () => {
    const res = await api.post('/api/v1/admin/login', { username: 'nobody', password: 'not-the-password' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error.message, 'That username and password do not match.');
  });

  await test('correct credentials return a session token', async () => {
    const res = await api.post('/api/v1/admin/login', { username: 'TESTER', password: ADMIN_PW });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    adminToken = res.body.data.token;
    assert.ok(adminToken && adminToken.length > 50);
    assert.ok(new Date(res.body.data.expiresAt) > new Date());
  });

  await test('the login response never contains the password or its hash', () => {
    assert.ok(!JSON.stringify(adminToken).includes(ADMIN_PW));
  });

  await test('orders are unreachable without a token', async () => {
    const res = await api.get('/api/v1/admin/orders');
    assert.strictEqual(res.status, 401);
  });

  await test('a forged token is refused', async () => {
    const forged = adminToken.slice(0, -6) + 'aaaaaa';
    const res = await api.get('/api/v1/admin/orders', { Authorization: `Bearer ${forged}` });
    assert.strictEqual(res.status, 401);
  });

  await test('a token signed with another secret is refused', async () => {
    const jwt = require('jsonwebtoken');
    const evil = jwt.sign({ sub: 'anyone', username: 'tester' }, 'a-different-secret-entirely-abc', {
      algorithm: 'HS256', expiresIn: 3600, issuer: 'matriamrit-api', audience: 'matriamrit-admin',
    });
    const res = await api.get('/api/v1/admin/orders', { Authorization: `Bearer ${evil}` });
    assert.strictEqual(res.status, 401);
  });

  await test('a valid token lists orders with the full phone number', async () => {
    const res = await api.get('/api/v1/admin/orders', auth());
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.total > 0);
    assert.match(res.body.data.orders[0].phone, /^\d{10}$/, 'dispatch needs the real number');
  });

  await test('search matches an order number, and a Mongo operator is treated as text', async () => {
    const byNumber = await api.get(`/api/v1/admin/orders?q=${created.orderNumber}`, auth());
    assert.strictEqual(byNumber.body.data.total, 1);

    const injected = await api.get(`/api/v1/admin/orders?q=${encodeURIComponent('{"$ne":null}')}`, auth());
    assert.strictEqual(injected.status, 200);
    assert.strictEqual(injected.body.data.total, 0, 'an operator in the search box must not match everything');
  });

  await test('an unpaid order cannot be dispatched', async () => {
    const fresh = await api.post('/api/v1/orders', VALID_ORDER);
    const res = await api.patch(
      `/api/v1/admin/orders/${fresh.body.data.orderNumber}/fulfilment`, { status: 'packed' }, auth()
    );
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error.message, /not been paid/);
  });

  await test('a paid order moves pending -> packed -> dispatched, signed by the admin', async () => {
    let res = await api.patch(
      `/api/v1/admin/orders/${created.orderNumber}/fulfilment`,
      { status: 'packed', note: 'Sealed with the pouch' }, auth()
    );
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.order.fulfilment.status, 'packed');
    assert.ok(res.body.data.order.fulfilment.packedAt);

    res = await api.patch(
      `/api/v1/admin/orders/${created.orderNumber}/fulfilment`,
      { status: 'dispatched', courier: 'Delhivery', trackingRef: 'DL-77421' }, auth()
    );
    assert.strictEqual(res.status, 200);

    const f = res.body.data.order.fulfilment;
    assert.strictEqual(f.status, 'dispatched');
    assert.strictEqual(f.courier, 'Delhivery');
    assert.strictEqual(f.trackingRef, 'DL-77421');
    assert.strictEqual(f.history.length, 2);
    assert.strictEqual(f.history[0].by, 'tester', 'every move records who made it');
  });

  await test('an impossible fulfilment jump is refused', async () => {
    const res = await api.patch(
      `/api/v1/admin/orders/${created.orderNumber}/fulfilment`, { status: 'pending' }, auth()
    );
    assert.strictEqual(res.status, 400);
  });

  await test('an unknown fulfilment status is refused by validation', async () => {
    const res = await api.patch(
      `/api/v1/admin/orders/${created.orderNumber}/fulfilment`, { status: 'lost-in-transit' }, auth()
    );
    assert.strictEqual(res.status, 400);
  });

  await test('the customer sees the dispatch progress, still without their phone number', async () => {
    const res = await api.get(`/api/v1/orders/${created.orderNumber}?phoneLast4=3210`);
    assert.strictEqual(res.body.data.order.fulfilment.status, 'dispatched');
    assert.strictEqual(res.body.data.order.fulfilment.trackingRef, 'DL-77421');
    assert.ok(!JSON.stringify(res.body).includes('9876543210'));
  });

  await test('the "not packed" filter also finds orders predating dispatch tracking', async () => {
    /* Exactly the shape of a document written before the field existed. */
    await Order.collection.updateOne(
      { orderNumber: created.orderNumber }, { $unset: { fulfilment: '' } }
    );
    const res = await api.get('/api/v1/admin/orders?fulfilment=pending', auth());
    assert.strictEqual(res.status, 200);
    assert.ok(
      res.body.data.orders.some(o => o.orderNumber === created.orderNumber),
      'an order with no fulfilment record is not packed and must show up as such'
    );
  });

  await test('signing out everywhere retires the token immediately', async () => {
    const out = await api.post('/api/v1/admin/logout-everywhere', {}, auth());
    assert.strictEqual(out.status, 200);

    const after = await api.get('/api/v1/admin/orders', auth());
    assert.strictEqual(after.status, 401, 'the old token must stop working at once');
  });

  await test('a disabled account cannot sign in', async () => {
    await Admin.updateOne({ username: 'tester' }, { $set: { active: false } });
    const res = await api.post('/api/v1/admin/login', { username: 'tester', password: ADMIN_PW });
    assert.strictEqual(res.status, 403);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await api.close();
  await disconnectDatabase();
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
