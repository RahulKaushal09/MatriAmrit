/* =====================================================================
   Minimal structured logger with PII redaction.

   Orders carry names, phone numbers and addresses. Those must not end
   up in a log aggregator, so every payload is walked and sensitive keys
   are masked before anything is printed.
   ===================================================================== */
'use strict';

const env = require('../config/env');

const REDACT = new Set([
  'name', 'fullname', 'phone', 'whatsapp', 'email', 'addressline', 'address',
  'landmark', 'lat', 'lng', 'latitude', 'longitude', 'signature',
  'razorpay_signature', 'key_secret', 'password', 'token', 'authorization',
]);

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;

function mask(value) {
  if (typeof value !== 'string' || value.length === 0) return '[redacted]';
  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.min(value.length - 4, 8))}${value.slice(-4)}`;
}

function redact(input, depth = 0) {
  if (depth > 6 || input == null) return input;
  if (Array.isArray(input)) return input.map(v => redact(v, depth + 1));
  if (typeof input !== 'object') return input;

  const out = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = REDACT.has(key.toLowerCase())
      ? mask(String(value))
      : redact(value, depth + 1);
  }
  return out;
}

function emit(level, message, meta) {
  if (LEVELS[level] > threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const text = env.NODE_ENV === 'production'
    ? JSON.stringify(line)
    : `${line.ts}  ${level.toUpperCase().padEnd(5)} ${message}${meta ? '  ' + JSON.stringify(redact(meta)) : ''}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(text);
}

module.exports = {
  error: (m, meta) => emit('error', m, meta),
  warn: (m, meta) => emit('warn', m, meta),
  info: (m, meta) => emit('info', m, meta),
  debug: (m, meta) => emit('debug', m, meta),
  redact,
};
