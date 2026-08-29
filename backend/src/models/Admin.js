/* =====================================================================
   Admin.

   One document per person who can see customer data. The password is
   never stored - only a bcrypt hash - and repeated wrong guesses lock
   the account for a while rather than letting someone grind at it.
   ===================================================================== */
'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

/* 12 rounds: about 250ms on modern hardware. Slow enough to make a
   stolen hash expensive, fast enough that a real login feels instant. */
const BCRYPT_ROUNDS = 12;

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 40,
      match: /^[a-z0-9._-]+$/,
    },

    /* Named for what it is, so nobody can mistake it for a password. */
    passwordHash: { type: String, required: true },

    name: { type: String, default: null, trim: true, maxlength: 80 },
    role: { type: String, enum: ['owner', 'staff'], default: 'staff' },
    active: { type: Boolean, default: true },

    lastLoginAt: { type: Date, default: null },

    /* Reset on any successful login. */
    failedAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },

    /* Moved forward to invalidate outstanding tokens - the way a
       logout-everywhere or a password change takes effect. Always set
       through `revokeExistingTokens()`. */
    tokensValidFrom: { type: Date, default: Date.now },
  },
  { timestamps: true, strict: 'throw', minimize: false }
);

/** Hashes a plaintext password. The only place bcrypt cost is decided. */
adminSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
};

adminSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

adminSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockedUntil && this.lockedUntil.getTime() > Date.now());
};

/** Records a wrong password, locking the account once attempts run out. */
adminSchema.methods.registerFailure = async function registerFailure() {
  this.failedAttempts += 1;
  if (this.failedAttempts >= env.ADMIN_LOGIN_MAX_ATTEMPTS) {
    this.lockedUntil = new Date(Date.now() + env.ADMIN_LOCKOUT_MINUTES * 60_000);
    this.failedAttempts = 0;
  }
  await this.save();
};

adminSchema.methods.registerSuccess = async function registerSuccess() {
  this.failedAttempts = 0;
  this.lockedUntil = null;
  this.lastLoginAt = new Date();
  await this.save();
};

/**
 * Retires every token this admin currently holds.
 *
 * A JWT's `iat` has one-second resolution, so a cutoff of exactly "now"
 * leaves a token minted in this same second looking valid. The cutoff is
 * therefore the START OF THE NEXT SECOND: it fails closed, at the cost of
 * a sub-second wait before signing back in.
 */
adminSchema.methods.revokeExistingTokens = function revokeExistingTokens() {
  this.tokensValidFrom = new Date(Math.floor(Date.now() / 1000) * 1000 + 1000);
};

/** What the browser is allowed to know about the signed-in admin. */
adminSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    username: this.username,
    name: this.name,
    role: this.role,
    lastLoginAt: this.lastLoginAt,
  };
};

module.exports = mongoose.model('Admin', adminSchema);
