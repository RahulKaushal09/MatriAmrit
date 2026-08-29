# MatriAmrit — Booking & Payments API

Node + Express + MongoDB. Takes laddu orders, prices them, and settles
payment through Razorpay.

## Quick start

```bash
cd backend
npm install
cp .env.example .env      # then fill in the values below
npm run dev               # http://localhost:4000
```

Check it came up:

```bash
curl http://localhost:4000/api/v1/health
```

Serve the site from the repo root in a second terminal:

```bash
python3 -m http.server 4321     # http://localhost:4321
```

`js/config.js` points at `localhost:4000` automatically when the site is
served from localhost, so the two halves connect with no extra config.

## Environment

Every value is validated at boot — a missing or malformed one exits with
a readable message instead of failing later during someone's checkout.

| Variable | What it is |
|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/matriamrit`, or your Atlas SRV string |
| `RAZORPAY_KEY_ID` | Dashboard → Account & Settings → API Keys. The **only** Razorpay value sent to the browser |
| `RAZORPAY_KEY_SECRET` | Its secret. Never leaves the server |
| `RAZORPAY_WEBHOOK_SECRET` | Set when you create the webhook (below) |
| `CORS_ORIGINS` | Comma-separated origin allowlist. Add your production domain |
| `TRUST_PROXY` | `1` behind Vercel/Render/Nginx, else rate limiting sees one shared IP |
| `DELIVERY_FEE_PAISE` | `0` — delivery is included in the box price and never shown as a separate line |
| `FREE_DELIVERY_ABOVE_PAISE` | `0` — unused while the fee is zero |
| `JWT_SECRET` | Signs admin session tokens, 32+ characters. Rotating it signs every admin out |
| `ADMIN_SESSION_HOURS` | How long an admin stays signed in. Default `8` |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | Wrong passwords before the account locks. Default `6` |
| `ADMIN_LOCKOUT_MINUTES` | How long that lock lasts. Default `15` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Read **once** by `npm run seed:admin`. Delete them afterwards |

All money is an integer count of **paise**. Floating point never touches a total.

**Delivery is not charged.** Both values above are `0`, the checkout shows a
single "Total to pay", and there is no delivery row anywhere in the UI. If you
ever decide to charge for it, set `DELIVERY_FEE_PAISE` and put the delivery
row back into `checkout.html` and `order-status.html` — the API already
computes and returns `deliveryFeePaise` on every quote and order.

## Coupons

Codes live in `src/data/coupons.js` — the same arrangement as the price
catalogue: the browser sends a code, and this file decides whether it exists,
whether it is live today, whether it applies to what is in the basket, and
what it is worth. A request claiming its own discount is refused by the
schema, not merely ignored.

To add a code, add an entry to `RAW_COUPONS` and restart. Amounts are written
in rupees for review and converted to paise at module load.

| Field | Meaning |
|---|---|
| `type` | `percent` (`value` is 1–100) or `flat` (`value` is rupees off) |
| `maxDiscount` | Rupee ceiling for a percentage code. `null` = uncapped |
| `minSubtotal` | Rupees the basket must reach before the code applies |
| `appliesTo` | Product ids the discount is computed on. `null` = the whole basket |
| `startsAt` / `endsAt` | ISO dates. Start inclusive, end exclusive. `null` = unbounded |
| `maxRedemptions` | How many **paid** orders may use it. `null` = unlimited |
| `active` | Master switch. Set `false` to retire a code rather than deleting it |

Retire codes with `active: false` instead of removing them — an order stores a
snapshot of the coupon it was priced with, so paid orders keep their history
whatever you do to the list afterwards.

Two behaviours worth knowing:

- **`POST /catalogue/quote` never fails on a bad code.** It returns the basket
  priced without the coupon plus a `couponError` explaining why, so the
  checkout can keep showing real money while the customer fixes the code.
  `POST /orders` is the gate that actually refuses, with a `COUPON_INVALID`
  422 — the checkout drops the coupon and re-prices when it sees one.
- **`maxRedemptions` is counted at order creation against paid orders only,**
  so an abandoned checkout never burns someone else's coupon. Two people
  paying in the same instant can push a code one past its cap; holding a lock
  across a payment window would cost more than the odd extra discount.

**Boxes are 1 kg and 2 kg.** There is no sub-kilo variant; 2 kg is priced at
the same rate per kg, not discounted. A stale basket holding a retired
variant id is refused with a 422 rather than silently repriced.

## Admin panel

The dispatch panel (`admin-login.html` → `admin.html` at the site root) runs on
the `/admin` routes. Create the first account once, from the backend directory:

```bash
# Set ADMIN_USERNAME and ADMIN_PASSWORD in .env, then:
npm run seed:admin
# ...or pass them directly, leaving nothing in a file:
npm run seed:admin -- bunny 'a-long-strong-password'

npm run backfill:fulfilment   # one time: gives orders placed before dispatch
                              # tracking existed a fulfilment record
```

Re-running `seed:admin` for an existing username **resets that password** and
signs out every session it had. The first account created is the `owner`;
anyone seeded later is `staff`.

**Delete `ADMIN_PASSWORD` from `.env` once seeded.** It is read exactly once;
only a bcrypt hash (cost 12) is ever stored.

How a session works: sign-in returns a short-lived HS256 JWT, held in the
browser's `sessionStorage` and sent as `Authorization: Bearer …`. There is no
refresh token and no session table. Three things end a session -

- it reaches `ADMIN_SESSION_HOURS` (default 8),
- someone rotates `JWT_SECRET`, which signs out **every** admin at once,
- `POST /admin/logout-everywhere`, or a password reset, which moves that
  admin's `tokensValidFrom` forward and retires their outstanding tokens.

Six wrong passwords (`ADMIN_LOGIN_MAX_ATTEMPTS`) lock an account for
`ADMIN_LOCKOUT_MINUTES`, which stops a slow grind against one username; the
login route's own rate limit stops a fast one across many.

### Dispatch

`status` is what the money did; `fulfilment.status` is what the box did. They
are deliberately separate - an order can be paid and still on the packing table.

```
not packed ──► packed ──► dispatched ──► delivered
```

Moving one step back is allowed so a mis-click can be undone, and `packed` may
go straight to `delivered` for an order handed over in person. Everything else
is refused, as is any move at all on an order that has not been paid for.
Every move records which admin made it, in `fulfilment.history`.

## Razorpay dashboard setup

1. **API keys** → copy the key id and secret into `.env`.
2. **Settings → Webhooks → Add New Webhook**
   - URL: `https://your-api-domain/api/v1/webhooks/razorpay`
   - Secret: any strong random string — put the same value in `RAZORPAY_WEBHOOK_SECRET`
   - Active events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`

The webhook is not optional. If a customer pays and closes the tab before
the browser calls `/verify`, the webhook is the only thing that marks the
order paid.

## Endpoints

Base path: `/api/v1`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + database state |
| `GET` | `/catalogue` | Products, prices, delivery rules |
| `POST` | `/catalogue/quote` | Server-priced totals for a basket, coupon included |
| `POST` | `/orders` | Create an order, open a Razorpay order |
| `POST` | `/orders/:orderNumber/verify` | Verify the checkout callback |
| `POST` | `/orders/:orderNumber/payment-failed` | Record a dismissed or declined attempt |
| `GET` | `/orders/:orderNumber?phoneLast4=1234` | Customer-facing status |
| `GET` | `/orders/geo/reverse?lat=&lng=` | Reverse geocode a map pin |
| `POST` | `/webhooks/razorpay` | Razorpay webhook receiver |

Admin routes. All but `login` need `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/admin/login` | Exchange username + password for a session token |
| `GET` | `/admin/me` | Confirm a stored token still works |
| `POST` | `/admin/logout-everywhere` | Retire every token for this admin |
| `GET` | `/admin/stats` | Paid today, awaiting dispatch, revenue |
| `GET` | `/admin/orders?status=&fulfilment=&q=&page=&limit=` | Order list |
| `GET` | `/admin/orders/:orderNumber` | Everything needed to pack and dispatch |
| `PATCH` | `/admin/orders/:orderNumber/fulfilment` | Move an order along |

## How a payment actually settles

```
browser                        API                         Razorpay
   │  POST /orders ───────────► price from server
   │                            catalogue, save order
   │                            create Razorpay order ────────►
   │  ◄── orderNumber, key id, razorpay order id
   │
   │  Razorpay Checkout ──────────────────────────────────────►
   │  ◄── order_id, payment_id, signature
   │
   │  POST /verify ───────────► 1. HMAC(order|payment) matches?
   │                            2. fetch payment ──────────────►
   │                            3. amount / currency / order_id
   │                               match OUR stored order?
   │                            → paid
   │
   │                      (browser closed?)
   │                            webhook ◄──────────────────────
   │                            same reconciliation → paid
```

**Step 3 is the one people leave out.** A valid signature only proves the
pair came from Razorpay. Without re-fetching the payment and comparing the
amount, someone can pair a genuine ₹1 payment with a ₹1,650 order and the
signature still verifies. `tests/flow.test.js` has a test for exactly this.

## Security

- **Prices are never accepted from the client.** The browser sends
  `{productId, variantId, quantity}`; `services/pricing.service.js` decides
  the amount from `data/catalogue.js`.
- **Discounts are never accepted from the client either.** The browser sends
  `couponCode` and nothing else; `data/coupons.js` decides what it is worth.
  An `amounts` object in the request body is rejected by the strict schema.
- **Coupon codes cannot be enumerated** — `/catalogue/quote` is capped at 60
  requests/15min, and an unknown code and a retired one return the same
  message.
- **Signatures** compared with `crypto.timingSafeEqual`.
- **Webhook signatures** verified over the raw body — `express.raw()` is
  mounted before `express.json()` in `app.js`. Reordering that breaks every
  webhook.
- **Idempotency** — webhook events are claimed by a unique index on the
  provider's event id, so a retry is a no-op.
- **NoSQL injection** — `middleware/sanitize.js` strips `$`-prefixed and
  dotted keys from body, query and params.
- **Rate limits** — tiered: 12 order creations/hour, 30 verifications/15min,
  60 quotes/15min, 10 failed admin sign-ins/15min. Skipped when `NODE_ENV=test`
  so the suite is not throttled by its own thoroughness.
- **Admin passwords** are bcrypt hashes at cost 12, never plaintext. A login for
  a username that does not exist still runs a hash, so a missing account does not
  answer measurably faster than a wrong password.
- **Admin tokens** are HS256 with the algorithm pinned on verification, so a
  token claiming `alg: none` is rejected rather than trusted.
- **Customer data behind the gate** — full phone numbers, addresses and map pins
  appear only in `toAdminJSON()`, which no unauthenticated route can reach. The
  customer-facing projection still masks the phone to its last four digits.
- **Search cannot inject** — the admin search term is regex-escaped, and
  `sanitizeFilter` turns any Mongo operator in request input into a literal.
  Filters the code writes itself opt out with `mongoose.trusted`.
- **Order lookup** needs the order number *and* the phone's last 4 digits,
  and returns an identical 404 for "wrong digits" and "no such order".
- **PII** — logs redact names, phones, emails and addresses; the raw IP is
  never stored, only a salted hash that rotates on restart.
- **Honeypot** field rejects naive bots.
- The key **secret** appears nowhere in any response. There is a test for it.

## Tests

```bash
npm test                  # 48 integration tests, needs mongod on :27017
npm run check:catalogue   # frontend and backend prices still agree
npm run seed:admin        # create or reset an admin account
npm run backfill:fulfilment
```

`npm test` stubs the Razorpay SDK but exercises the real pricing,
validation, signature, reconciliation and webhook code against a real
MongoDB.

**Run `npm run check:catalogue` after any price change.** The frontend keeps
its own copy of the catalogue in `js/catalogue.js` so product pages render
without an API call; this script fails if the two drift apart.

## Going live

- [ ] Swap `rzp_test_` keys for `rzp_live_` and set `NODE_ENV=production`
- [ ] Point `js/config.js` → `PRODUCTION_API` at your real API host
- [ ] Add the production site origin to `CORS_ORIGINS`
- [ ] Set `TRUST_PROXY=1` if there is a proxy in front
- [ ] Register the webhook against the production URL
- [ ] Build indexes once (`autoIndex` is off in production)
- [ ] Generate a real `JWT_SECRET`:
      `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- [ ] `npm run seed:admin` with a strong password, then delete `ADMIN_PASSWORD` from `.env`
- [ ] `npm run backfill:fulfilment` once, for orders placed before dispatch tracking
- [ ] Serve `admin.html` over HTTPS only — a bearer token on plain HTTP is readable
      by anyone on the network
- [ ] Review `src/data/coupons.js`; it ships with three example codes
- [ ] Confirm `.env` is not committed — it is in `backend/.gitignore`
