'use strict';

const express = require('express');
const controller = require('../controllers/catalogue.controller');
const validate = require('../middleware/validate');
const limiters = require('../middleware/rateLimiters');
const { quoteSchema } = require('../validators/order.validator');

const router = express.Router();

router.get('/', controller.getCatalogue);

/* Quoting is cheap, but it is also where a coupon code is tested - so it
   is capped tightly enough that codes cannot be guessed in bulk. */
router.post('/quote', limiters.quoteLimiter, validate({ body: quoteSchema }), controller.quote);

module.exports = router;
