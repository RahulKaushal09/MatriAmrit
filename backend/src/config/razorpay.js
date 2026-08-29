/* =====================================================================
   Razorpay client singleton.

   The secret lives here and in the HMAC helpers only. It is never
   attached to a response, a log line, or anything the browser can see.
   ===================================================================== */
'use strict';

const Razorpay = require('razorpay');
const env = require('./env');

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

/* The only Razorpay value the frontend is ever given. */
const publicKeyId = env.RAZORPAY_KEY_ID;

module.exports = { razorpay, publicKeyId };
