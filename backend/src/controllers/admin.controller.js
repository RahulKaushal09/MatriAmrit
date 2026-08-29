'use strict';

const adminService = require('../services/admin.service');
const asyncHandler = require('../middleware/asyncHandler');

/** POST /admin/login */
const login = asyncHandler(async (req, res) => {
  const result = await adminService.login({
    username: req.body.username,
    password: req.body.password,
  });
  res.json({ success: true, data: result });
});

/** GET /admin/me - lets the panel confirm a stored token still works. */
const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { admin: req.admin.toPublicJSON() } });
});

/** POST /admin/logout-everywhere - retires every token for this admin. */
const logoutEverywhere = asyncHandler(async (req, res) => {
  req.admin.revokeExistingTokens();
  await req.admin.save();
  res.json({ success: true, data: { signedOut: true } });
});

/** GET /admin/orders */
const listOrders = asyncHandler(async (req, res) => {
  const result = await adminService.listOrders(req.query);
  res.json({ success: true, data: result });
});

/** GET /admin/orders/:orderNumber */
const getOrder = asyncHandler(async (req, res) => {
  const order = await adminService.getOrder(req.params.orderNumber);
  res.json({ success: true, data: { order: order.toAdminJSON() } });
});

/** PATCH /admin/orders/:orderNumber/fulfilment */
const updateFulfilment = asyncHandler(async (req, res) => {
  const order = await adminService.updateFulfilment({
    orderNumber: req.params.orderNumber,
    to: req.body.status,
    courier: req.body.courier,
    trackingRef: req.body.trackingRef,
    note: req.body.note,
    admin: req.admin,
  });
  res.json({ success: true, data: { order: order.toAdminJSON() } });
});

/** GET /admin/stats */
const stats = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await adminService.getStats() });
});

module.exports = { login, me, logoutEverywhere, listOrders, getOrder, updateFulfilment, stats };
