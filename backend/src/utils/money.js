/* =====================================================================
   Money.

   Every amount in this codebase is an integer number of paise. Rupees
   exist only at the edges: in the catalogue file where a human writes
   them, and in text shown to a customer. Floating point never touches a
   total.
   ===================================================================== */
'use strict';

const rupeesToPaise = rupees => Math.round(Number(rupees) * 100);

const paiseToRupees = p => p / 100;

/** "₹1,450" - Indian digit grouping, no decimals when the amount is whole. */
function formatPaise(p) {
  const rupees = paiseToRupees(p);
  const hasPaise = p % 100 !== 0;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Guards against a NaN or float sneaking into a stored total. */
function assertPaise(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer of paise, received ${value}`);
  }
  return value;
}

module.exports = { rupeesToPaise, paiseToRupees, formatPaise, assertPaise };
