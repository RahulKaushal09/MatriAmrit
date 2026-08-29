/* =====================================================================
   Admin request schemas.

   The login schema is deliberately loose about what a password may
   contain and strict about its length: rejecting characters here would
   only stop people choosing good ones.
   ===================================================================== */
'use strict';

const { z } = require('zod');
const { ORDER_STATUSES, FULFILMENT_STATUSES } = require('../models/Order');
const { ORDER_NUMBER_PATTERN } = require('../utils/orderNumber');

const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Enter your username')
    .max(40)
    .regex(/^[a-z0-9._-]+$/, 'That username is not valid'),
  password: z.string().min(8, 'Enter your password').max(200),
}).strict();

const listQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  fulfilment: z.enum(FULFILMENT_STATUSES).optional(),
  q: z.string().trim().max(60).optional().transform(v => v || undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

const orderNumberParamSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(ORDER_NUMBER_PATTERN, 'That order number does not look right'),
});

const fulfilmentSchema = z.object({
  /* 'pending' is here so a mistaken "packed" can be undone. */
  status: z.enum(FULFILMENT_STATUSES),
  courier: z.union([z.string().trim().max(80), z.literal('')]).optional().transform(v => v || null),
  trackingRef: z.union([z.string().trim().max(80), z.literal('')]).optional().transform(v => v || null),
  note: z.union([z.string().trim().max(300), z.literal('')]).optional().transform(v => v || null),
}).strict();

module.exports = { loginSchema, listQuerySchema, orderNumberParamSchema, fulfilmentSchema };
