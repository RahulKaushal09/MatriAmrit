/* =====================================================================
   Environment loading + validation.

   Everything the app reads from process.env passes through here once,
   at boot, and is validated. A missing or malformed value crashes the
   process immediately with a readable message rather than surfacing as
   a mystery 500 during a customer's checkout.
   ===================================================================== */
'use strict';

const path = require('path');
const { z } = require('zod');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/* A comma-separated list -> a trimmed, de-duplicated array. */
const csv = z
  .string()
  .default('')
  .transform(v => [...new Set(v.split(',').map(s => s.trim()).filter(Boolean))]);

/* Money is always an integer count of paise. Never a float. */
const paise = z.coerce.number().int().nonnegative();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  CORS_ORIGINS: csv,
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .refine(v => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'), {
      message: 'MONGODB_URI must start with mongodb:// or mongodb+srv://',
    }),

  RAZORPAY_KEY_ID: z.string().min(1, 'RAZORPAY_KEY_ID is required'),
  RAZORPAY_KEY_SECRET: z.string().min(1, 'RAZORPAY_KEY_SECRET is required'),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1, 'RAZORPAY_WEBHOOK_SECRET is required'),

  /* Signs admin session tokens. Rotating it logs every admin out, which
     is the intended way to revoke a leaked token. */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ADMIN_SESSION_HOURS: z.coerce.number().int().positive().max(72).default(8),
  ADMIN_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().max(20).default(6),
  ADMIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().max(1440).default(15),

  DELIVERY_FEE_PAISE: paise.default(7900),
  FREE_DELIVERY_ABOVE_PAISE: paise.default(150000),
  MAX_UNITS_PER_LINE: z.coerce.number().int().positive().max(100).default(20),
  MAX_LINES_PER_ORDER: z.coerce.number().int().positive().max(20).default(6),
  MAX_ORDER_VALUE_PAISE: paise.default(5000000),

  NOMINATIM_BASE_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
  NOMINATIM_USER_AGENT: z.string().min(1).default('MatriAmrit/1.0'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map(i => `  • ${i.path.join('.')}: ${i.message}`);
  console.error('\n✗ Invalid backend environment. Fix backend/.env:\n' + lines.join('\n') + '\n');
  process.exit(1);
}

const env = Object.freeze(parsed.data);

/* A live secret in a non-production build is almost always a mistake. */
if (env.NODE_ENV !== 'production' && env.RAZORPAY_KEY_ID.startsWith('rzp_live_')) {
  console.warn('⚠  A LIVE Razorpay key is loaded while NODE_ENV is not "production".');
}
if (env.NODE_ENV === 'production' && env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
  console.warn('⚠  A TEST Razorpay key is loaded in production. No real payment will settle.');
}

/* The seed script reads ADMIN_PASSWORD once and stores only a hash. It has
   no business sitting in a production environment afterwards. */
if (env.NODE_ENV === 'production' && process.env.ADMIN_PASSWORD) {
  console.warn('⚠  ADMIN_PASSWORD is set in production. Seed the admin, then remove it from .env.');
}

module.exports = env;
