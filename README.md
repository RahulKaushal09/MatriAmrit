# MatriAmrit - Website

A static marketing site plus a Node/Express booking API. The pages are still
plain HTML/CSS/JS with no build step; ordering and payment are handled by
`backend/` (see [backend/README.md](backend/README.md)).

## Pages

| File | What it is |
|---|---|
| `index.html` | Landing page - hero, philosophy, interactive stage finder, product preview, Samskara rail, four care pillars, comparison table, testimonials, FAQ, newsletter |
| `products.html` | Full 9-item catalogue with stage filters, sourcing transparency, subscription comparison |
| `samskaras.html` | All 16 Samskaras as a filterable vertical timeline - the strongest differentiating content on the site |
| `contact.html` | Enquiry form with stage/topic routing, contact details, quick answers |
| `privacy-policy.html` | Privacy Policy - DPDP Act 2023 / IT Rules 2011, Razorpay payment-data section, Grievance Officer |
| `terms.html` | Terms & Conditions, with Shipping & Delivery (`#shipping`) and Cancellation & Refunds (`#refunds`) as separately linkable sections |
| `product.html` | Product detail page - 1 kg / 2 kg boxes, live totals, full ingredient list, Parampara panel, FAQs. Driven by `?id=` |
| `checkout.html` | Booking form - contact, address, optional Leaflet pin, Razorpay payment |
| `order-status.html` | Post-payment confirmation, and order lookup by number + phone digits |
| `admin-login.html` | Staff sign-in for the dispatch panel. `noindex`, and not linked from anywhere on the site |
| `admin.html` | Dispatch panel - orders, packing detail, pack/dispatch/deliver, WhatsApp composer |
| `css/style.css` | Entire design system, 30 numbered sections |
| `js/main.js` | 12 self-guarding interaction modules - same file runs on every page |
| `js/config.js` | API base URL and shared runtime constants |
| `js/catalogue.js` | Product copy, images and display prices (mirrors the server catalogue) |
| `js/product.js` | Product detail page: variant picker, quantity, hand-off to checkout |
| `js/checkout.js` | Basket, validation, Leaflet map, Razorpay checkout and verification |
| `js/order-status.js` | Order status rendering and lookup |
| `js/admin-api.js` | Admin session token + API client, shared by both admin pages |
| `js/admin-login.js` | Sign-in form |
| `js/admin.js` | The dispatch panel |
| `css/admin.css` | Panel styling, layered on the same tokens as `style.css` |
| `backend/` | Express API - orders, pricing, Razorpay, webhooks. Its own README |

## Running it

The marketing pages work from any static server on their own:

```bash
python3 -m http.server 4321      # http://localhost:4321
```

Ordering additionally needs the API and a MongoDB:

```bash
cd backend && npm install && cp .env.example .env   # fill in the values
npm run dev                                          # http://localhost:4000
```

`js/config.js` detects localhost and points at `:4000` automatically.
Full setup, endpoints and Razorpay dashboard config are in
[backend/README.md](backend/README.md).

## The dispatch panel

`admin-login.html` → `admin.html`. Neither page is linked from the site and both
carry `noindex, nofollow, noarchive`; the only way in is the URL plus an account.

Create the first account once the API and MongoDB are running:

```bash
cd backend
# set ADMIN_USERNAME and ADMIN_PASSWORD in .env, then:
npm run seed:admin
npm run backfill:fulfilment   # one time, for orders placed before dispatch tracking
```

Then open `admin-login.html` and sign in. The panel shows every order with its
payment state and dispatch state, opens one in full - items to pack, the address,
the customer's map pin if they dropped one, their note, the payment trail - and
moves it along **not packed → packed → dispatched → delivered**. Each move records
which admin made it.

The **Message on WhatsApp** button drafts the message for where the order actually
is: payment pending, confirmed, packed, dispatched, delivered, or a request to
confirm the address. The draft is editable, and nothing is sent from the panel -
it opens WhatsApp with the text ready, so the last look is always a human's.

Three things the panel will not do: dispatch an order that has not been paid for,
change what an order cost, or show a customer's details to anyone without a valid
session. The session lives in `sessionStorage` and ends when the tab closes.

## The ordering flow

```
products.html ──► product.html?id=… ──► checkout.html ──► order-status.html
                    pick size & qty      details + pay        confirmation
```

Two rules hold this together:

1. **The browser never sets a price.** It sends only
   `{productId, variantId, quantity}`. Every rupee comes from
   `backend/src/data/catalogue.js`. Boxes are 1 kg and 2 kg only, and
   delivery is included in the price - there is no delivery line anywhere.
2. **A Razorpay signature alone is not proof of payment.** The server also
   re-fetches the payment and checks the amount, currency and order id
   against the order it stored. See backend/README.md.

`js/catalogue.js` duplicates the product data so pages render with no API
call. After changing a price in either file, run:

```bash
cd backend && npm run check:catalogue
```

It fails loudly if the displayed price and the charged price have drifted apart.

## Design system

**Direction: "Sacred Modern."** Ayurvedic warmth held to a contemporary editorial
standard - nothing that reads as either clip-art spirituality or a generic D2C
wellness template.

**Palette** - tokens live at the top of `css/style.css`:

| Token | Value | Role |
|---|---|---|
| `--ivory` / `--parchment` | `#FCF8F2` / `#F5ECDD` | Page and alternate section surfaces |
| `--ink` | `#241812` | Headings, dark sections, footer |
| `--saffron` | `#DC8C33` | Primary brand accent, gradients |
| `--kumkum` | `#8E2F2A` | Eyebrows, links, primary buttons |
| `--tulsi` | `#4F6B4B` | Confirmations, "yes" states |
| `--gold` | `#C6A353` | Mandala linework, ornamental rules |

**Type** - `Fraunces` (variable serif, optical sizing) for display, `Inter` for body,
`Tiro Devanagari Sanskrit` for Sanskrit. All sizes are fluid `clamp()` - never set a
fixed `px` font-size.

**Motion** - every transition uses `--ease`. Everything is disabled under
`prefers-reduced-motion: reduce`.

## Imagery - deliberate decision

The site ships with **zero external images**. Every visual is hand-built SVG or CSS:
the hero (temple arch + mandala + mother-and-child), product glyphs, stage glyphs,
icons, and the logo mark. That means nothing breaks, nothing loads slowly, nothing
has a licence question, and the whole site is one folder you can email.

**When you have real photography**, these are the swap points:

1. **Product cards** - replace `.prod__media`'s inline `style="background:…"` and the
   `<svg class="prod__glyph">` with `<img class="prod__glyph" src="assets/img/…">`.
   The 4:3 aspect ratio and hover-scale are already handled by CSS.
2. **Stage panels** (`index.html`, `.stage-visual`) - the gradient block is sized
   `4 / 3.4`; drop a photo in with `object-fit: cover`.
3. **Hero** - keep the SVG. A photograph here will fight the type. If you must, put
   the photo *inside* the arch by swapping the `<g clip-path="url(#arch)">` contents
   for an `<image>` element.

Put files in `assets/img/`.

## Interaction modules (`js/main.js`)

Numbered and independently guarded, so deleting any section is safe:

1. Seamless marquees - clones children once so the `-50%` CSS loop is invisible
2. Sticky nav + scroll-progress bar
3. Mobile drawer (Escape closes, scroll locks)
4. Scroll reveal via IntersectionObserver
5. Animated stat counters
6. Journey stage tabs - full arrow-key/Home/End roving tabindex
7. Filtering - one generic module driving both the product grid and the Samskara timeline
8. Samskara rail - arrow buttons, drag-to-scroll, disabled-state sync
9. FAQ accordion
10. Form validation (demo handlers - see below)
11. Footer year
12. Current-page nav marking

## Before going live

- [ ] **Wire the remaining forms.** The booking flow is live against `backend/`.
      `#subForm` (newsletter) and `#contactForm` still only show a friendly message
      and reset - point those at Formspree, Netlify Forms, or a backend route.
- [ ] **Replace placeholder contact details** in `contact.html` and every footer -
      `matriamrit.gkg@gmail.com`, `+91 90000 00000`, and the Bengaluru address are stand-ins.
- [ ] **Replace the `#` social links** in all four footers.
- [ ] **Confirm the pricing.** Box prices live in TWO files that must agree -
      `backend/src/data/catalogue.js` (what is charged) and `js/catalogue.js`
      (what is shown). Verify with `cd backend && npm run check:catalogue`.
- [ ] **Add the real Razorpay keys** to `backend/.env`, register the webhook, and
      point `PRODUCTION_API` in `js/config.js` at your API host. Details in
      [backend/README.md](backend/README.md).
- [ ] **Change the admin password and generate a real `JWT_SECRET`.** `.env` ships
      with a development password; run `npm run seed:admin` with a strong one, then
      delete `ADMIN_PASSWORD` from `.env`. Rotating `JWT_SECRET` signs every admin
      out. Serve `admin.html` over HTTPS only - a session token on plain HTTP is
      readable by anyone on the network.
- [ ] **Review the coupon list** in `backend/src/data/coupons.js` before launch -
      it ships with three example codes. Retire one with `active: false` rather
      than deleting it, so paid orders keep their history.
- [ ] **Fill the legal placeholders.** `privacy-policy.html` and `terms.html` are live
      and linked from every footer, but each carries `<!-- OPERATOR: ... -->` comments
      marking what only you can supply: registered legal entity name, GSTIN, FSSAI
      licence number, and the named Grievance Officer. Razorpay's review checks for a
      real entity name and working contact details.
- [ ] **Verify every health claim** with your vaidya and a paediatrician before
      launch. The copy is deliberately careful - the honey-and-infant-botulism note in
      `samskaras.html` (Jatakarma) is there on purpose and should stay.
- [ ] Add real OG images (`assets/img/og.jpg`) and update the `og:image` meta tags.

## Testing

```bash
cd backend && npm test              # 48 API integration tests (needs mongod)
cd backend && npm run check:catalogue
```

The API suite covers price tampering, forged signatures, the
valid-signature-but-underpaid attack, webhook replay, settlement of an order the
customer abandoned mid-payment, coupon abuse (client-claimed discounts, scoped
and expired codes, percentage caps), and admin access (forged tokens, tokens
signed with another secret, dispatching an unpaid order, and search-box injection).

## Accessibility

Semantic landmarks, skip link, visible focus rings, ARIA on tabs/accordion/filters,
`aria-live` on the contact form status, alt/`aria-label` on every icon and
illustration, and full `prefers-reduced-motion` support. The booking form marks
invalid fields with `aria-invalid` and announces errors through a live region.

Verified across all nine pages: zero horizontal scroll from 320px to 1440px, and
zero console errors.
