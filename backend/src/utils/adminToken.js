/* =====================================================================
   Admin session tokens.

   A short-lived signed JWT, held in the browser's sessionStorage and
   sent as `Authorization: Bearer …`. There is no refresh token and no
   server-side session table: the token expires, and rotating either
   JWT_SECRET or an admin's `tokensValidFrom` invalidates outstanding
   ones immediately.
   ===================================================================== */
'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ISSUER = 'matriamrit-api';
const AUDIENCE = 'matriamrit-admin';

/** Signs a session for an admin document. Returns the token and its expiry. */
function issueToken(admin) {
  const expiresInSeconds = env.ADMIN_SESSION_HOURS * 3600;

  const token = jwt.sign(
    {
      sub: String(admin._id),
      username: admin.username,
      role: admin.role,
      /* Seconds, matching `iat`, so a token issued before the admin's
         `tokensValidFrom` can be rejected without a database lookup of
         its own. */
      tvf: Math.floor(new Date(admin.tokensValidFrom).getTime() / 1000),
    },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: expiresInSeconds, issuer: ISSUER, audience: AUDIENCE }
  );

  return { token, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
}

/**
 * Verifies a token. Returns its claims, or null for anything at all
 * wrong with it - expired, forged, or signed for another audience.
 *
 * `algorithms` is pinned: without it a token could claim `alg: none`.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  } catch {
    return null;
  }
}

/** Pulls the bearer token out of an Authorization header, or null. */
function readBearer(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match ? match[1].trim() : null;
}

module.exports = { issueToken, verifyToken, readBearer };
