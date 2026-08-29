/* =====================================================================
   Admin gate.

   Every /admin route except login passes through here. A request either
   arrives with a valid, unexpired token belonging to an active admin, or
   it gets a 401 - there is no partially-authenticated state.
   ===================================================================== */
'use strict';

const Admin = require('../models/Admin');
const { verifyToken, readBearer } = require('../utils/adminToken');
const asyncHandler = require('./asyncHandler');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/* One message for every failure. A caller learns whether they are in,
   never why they are out. */
const DENIED = 'Your session has ended. Please sign in again.';

const requireAdmin = asyncHandler(async (req, _res, next) => {
  const token = readBearer(req.get('authorization'));
  if (!token) throw ApiError.unauthorized(DENIED);

  const claims = verifyToken(token);
  if (!claims) throw ApiError.unauthorized(DENIED);

  const admin = await Admin.findById(claims.sub);
  if (!admin || !admin.active) {
    logger.warn('Admin token for a missing or disabled account', { requestId: req.id });
    throw ApiError.unauthorized(DENIED);
  }

  /* A password change or a forced sign-out moves `tokensValidFrom`
     forward, which retires every token issued before it. */
  const validFrom = Math.floor(new Date(admin.tokensValidFrom).getTime() / 1000);
  if (claims.iat < validFrom) throw ApiError.unauthorized(DENIED);

  req.admin = admin;
  next();
});

/** Route guard for owner-only actions. Use after requireAdmin. */
const requireOwner = (req, _res, next) => {
  if (req.admin?.role !== 'owner') {
    return next(ApiError.forbidden('That action needs an owner account.'));
  }
  return next();
};

module.exports = { requireAdmin, requireOwner };
