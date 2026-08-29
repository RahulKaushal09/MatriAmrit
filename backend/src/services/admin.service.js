/* =====================================================================
   Admin operations.

   Reading orders for dispatch, and moving them along. Nothing here can
   change what an order cost - money is the pricing service's business
   and stays settled once paid.
   ===================================================================== */
'use strict';

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Admin = require('../models/Admin');
const { issueToken } = require('../utils/adminToken');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/* The same message for "no such user" and "wrong password", so the form
   cannot be used to discover which usernames exist. */
const BAD_CREDENTIALS = 'That username and password do not match.';

/* Which fulfilment moves are allowed. Forward through the pack-dispatch-
   deliver sequence, and one step back so a mis-click can be undone. */
const FULFILMENT_TRANSITIONS = Object.freeze({
  pending: ['packed', 'dispatched'],
  packed: ['dispatched', 'delivered', 'pending'],   // hand-delivered skips the courier step
  dispatched: ['delivered', 'packed'],
  delivered: ['dispatched'],
});

const TIMESTAMP_FIELD = Object.freeze({
  packed: 'packedAt',
  dispatched: 'dispatchedAt',
  delivered: 'deliveredAt',
});

/* ── Sign in ──────────────────────────────────────────────────────── */

async function login({ username, password }) {
  const admin = await Admin.findOne({ username: String(username).toLowerCase().trim() });

  /* Hash a throwaway password when the user does not exist, so a missing
     account does not answer measurably faster than a wrong password. */
  if (!admin) {
    await Admin.hashPassword(password);
    throw ApiError.unauthorized(BAD_CREDENTIALS);
  }

  if (!admin.active) throw ApiError.forbidden('That account has been disabled.');

  if (admin.isLocked()) {
    const minutes = Math.max(1, Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60_000));
    throw ApiError.tooMany(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }

  const ok = await admin.verifyPassword(password);
  if (!ok) {
    await admin.registerFailure();
    logger.warn('Failed admin login', { username: admin.username });
    throw ApiError.unauthorized(BAD_CREDENTIALS);
  }

  await admin.registerSuccess();
  logger.info('Admin signed in', { username: admin.username });

  const { token, expiresAt } = issueToken(admin);
  return { token, expiresAt, admin: admin.toPublicJSON() };
}

/* ── Orders ───────────────────────────────────────────────────────── */

/** Escapes a search term so a customer named "a.b" cannot act as a regex. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listOrders({ status, fulfilment, q, page = 1, limit = 25 }) {
  const filter = {};
  /* Two independent $or clauses cannot both sit at the top level, so any
     that are needed are collected here and combined under $and. */
  const clauses = [];

  if (status) filter.status = status;

  if (fulfilment === 'pending') {
    /* An order placed before dispatch tracking existed has no fulfilment
       field at all, and is - correctly - not packed. Matching only
       "pending" would hide exactly the orders that still need packing.
       `backfill-fulfilment.js` settles the data; this keeps the filter
       honest whether or not it has been run. */
    clauses.push({
      $or: [
        { 'fulfilment.status': 'pending' },
        { 'fulfilment.status': mongoose.trusted({ $exists: false }) },
      ],
    });
  } else if (fulfilment) {
    filter['fulfilment.status'] = fulfilment;
  }

  /* One box searches everything an operator has to hand: an order
     number off a message, a phone number, a name, a PIN code. */
  if (q) {
    const term = escapeRegex(q.trim());
    const rx = new RegExp(term, 'i');
    clauses.push({
      $or: [
        { orderNumber: new RegExp(`^${term}`, 'i') },
        { 'customer.phone': rx },
        { 'customer.name': rx },
        { 'delivery.pincode': rx },
        { 'delivery.city': rx },
        { 'coupon.code': new RegExp(`^${term}`, 'i') },
      ],
    });
  }

  if (clauses.length) filter.$and = clauses;

  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  return {
    orders: orders.map(o => o.toAdminSummaryJSON()),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function getOrder(orderNumber) {
  const order = await Order.findOne({ orderNumber });
  if (!order) throw ApiError.notFound('No order with that number.');
  return order;
}

/**
 * Moves an order along the dispatch sequence.
 *
 * Two rules worth stating: a box cannot leave before the money arrived,
 * and every move is signed with the username that made it.
 */
async function updateFulfilment({ orderNumber, to, courier, trackingRef, note, admin }) {
  const order = await getOrder(orderNumber);
  const from = order.fulfilment?.status || 'pending';

  if (to === from) {
    throw ApiError.badRequest(`This order is already marked ${to}.`);
  }

  if (!FULFILMENT_TRANSITIONS[from].includes(to)) {
    throw ApiError.badRequest(`An order cannot go from ${from} to ${to}.`);
  }

  if (to !== 'pending' && order.status !== 'paid') {
    throw ApiError.badRequest(
      `This order has not been paid for (payment is "${order.status}"). Nothing should be dispatched yet.`
    );
  }

  order.fulfilment.status = to;
  if (courier !== undefined) order.fulfilment.courier = courier || null;
  if (trackingRef !== undefined) order.fulfilment.trackingRef = trackingRef || null;
  if (note !== undefined) order.fulfilment.note = note || null;

  const stamp = TIMESTAMP_FIELD[to];
  if (stamp) order.fulfilment[stamp] = new Date();

  order.fulfilment.history.push({
    from,
    to,
    by: admin.username,
    note: note || null,
    at: new Date(),
  });

  await order.save();
  logger.info('Fulfilment updated', { orderNumber, from, to, by: admin.username });

  return order;
}

/* ── Dashboard ────────────────────────────────────────────────────── */

/** The handful of numbers worth seeing before opening a single order. */
async function getStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [byStatus, byFulfilment, todayPaid, revenue] = await Promise.all([
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: '$fulfilment.status', count: { $sum: 1 } } },
    ]),
    /* `sanitizeFilter` is on globally, which turns any operator object in
       a filter into an `$eq` - exactly what you want for a value that came
       from a request, and exactly what you must opt out of for one the
       code wrote itself. Hence `mongoose.trusted`. */
    Order.countDocuments({ status: 'paid', createdAt: mongoose.trusted({ $gte: startOfToday }) }),
    Order.aggregate([
      { $match: { status: 'paid' } },
      {
        $group: {
          _id: null,
          allTimePaise: { $sum: '$amounts.totalPaise' },
          discountPaise: { $sum: '$amounts.discountPaise' },
        },
      },
    ]),
  ]);

  const tally = rows => rows.reduce((acc, r) => ({ ...acc, [r._id || 'pending']: r.count }), {});

  return {
    orders: tally(byStatus),
    fulfilment: tally(byFulfilment),
    paidToday: todayPaid,
    revenuePaise: revenue[0]?.allTimePaise || 0,
    discountGivenPaise: revenue[0]?.discountPaise || 0,
  };
}

module.exports = {
  login,
  listOrders,
  getOrder,
  updateFulfilment,
  getStats,
  FULFILMENT_TRANSITIONS,
};
