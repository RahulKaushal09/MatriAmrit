/* =====================================================================
   Public order reference.

   Customers quote this on WhatsApp, so it is short and unambiguous:
   no O/0/I/1/L confusion. It is random rather than sequential, so it
   leaks neither our order volume nor another customer's reference.
   ===================================================================== */
'use strict';

const crypto = require('crypto');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0 O 1 I L

function randomBlock(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** e.g. MA-6082-K3QF7X */
function generateOrderNumber() {
  const now = new Date();
  const stamp = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `MA-${now.getFullYear().toString().slice(-2)}${stamp}-${randomBlock(6)}`;
}

const ORDER_NUMBER_PATTERN = /^MA-\d{6}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

module.exports = { generateOrderNumber, ORDER_NUMBER_PATTERN };
