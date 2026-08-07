# MatriAmrit — Website

Static site. No build step, no dependencies, no npm. Open `index.html` in a browser
and it works.

## Pages

| File | What it is |
|---|---|
| `index.html` | Landing page — hero, philosophy, interactive stage finder, product preview, Samskara rail, four care pillars, comparison table, testimonials, FAQ, newsletter |
| `products.html` | Full 9-item catalogue with stage filters, sourcing transparency, subscription comparison |
| `samskaras.html` | All 16 Samskaras as a filterable vertical timeline — the strongest differentiating content on the site |
| `contact.html` | Enquiry form with stage/topic routing, contact details, quick answers |
| `css/style.css` | Entire design system, 26 numbered sections |
| `js/main.js` | 12 self-guarding interaction modules — same file runs on every page |

## Running it

Any static server. For example:

```bash
python3 -m http.server 4321
```

Then open `http://localhost:4321`.

## Design system

**Direction: "Sacred Modern."** Ayurvedic warmth held to a contemporary editorial
standard — nothing that reads as either clip-art spirituality or a generic D2C
wellness template.

**Palette** — tokens live at the top of `css/style.css`:

| Token | Value | Role |
|---|---|---|
| `--ivory` / `--parchment` | `#FCF8F2` / `#F5ECDD` | Page and alternate section surfaces |
| `--ink` | `#241812` | Headings, dark sections, footer |
| `--saffron` | `#DC8C33` | Primary brand accent, gradients |
| `--kumkum` | `#8E2F2A` | Eyebrows, links, primary buttons |
| `--tulsi` | `#4F6B4B` | Confirmations, "yes" states |
| `--gold` | `#C6A353` | Mandala linework, ornamental rules |

**Type** — `Fraunces` (variable serif, optical sizing) for display, `Inter` for body,
`Tiro Devanagari Sanskrit` for Sanskrit. All sizes are fluid `clamp()` — never set a
fixed `px` font-size.

**Motion** — every transition uses `--ease`. Everything is disabled under
`prefers-reduced-motion: reduce`.

## Imagery — deliberate decision

The site ships with **zero external images**. Every visual is hand-built SVG or CSS:
the hero (temple arch + mandala + mother-and-child), product glyphs, stage glyphs,
icons, and the logo mark. That means nothing breaks, nothing loads slowly, nothing
has a licence question, and the whole site is one folder you can email.

**When you have real photography**, these are the swap points:

1. **Product cards** — replace `.prod__media`'s inline `style="background:…"` and the
   `<svg class="prod__glyph">` with `<img class="prod__glyph" src="assets/img/…">`.
   The 4:3 aspect ratio and hover-scale are already handled by CSS.
2. **Stage panels** (`index.html`, `.stage-visual`) — the gradient block is sized
   `4 / 3.4`; drop a photo in with `object-fit: cover`.
3. **Hero** — keep the SVG. A photograph here will fight the type. If you must, put
   the photo *inside* the arch by swapping the `<g clip-path="url(#arch)">` contents
   for an `<image>` element.

Put files in `assets/img/`.

## Interaction modules (`js/main.js`)

Numbered and independently guarded, so deleting any section is safe:

1. Seamless marquees — clones children once so the `-50%` CSS loop is invisible
2. Sticky nav + scroll-progress bar
3. Mobile drawer (Escape closes, scroll locks)
4. Scroll reveal via IntersectionObserver
5. Animated stat counters
6. Journey stage tabs — full arrow-key/Home/End roving tabindex
7. Filtering — one generic module driving both the product grid and the Samskara timeline
8. Samskara rail — arrow buttons, drag-to-scroll, disabled-state sync
9. FAQ accordion
10. Form validation (demo handlers — see below)
11. Footer year
12. Current-page nav marking

## Before going live

- [ ] **Wire the forms.** `#subForm` and `#contactForm` currently show a friendly
      message and reset. Point them at Formspree, Netlify Forms, or your backend.
- [ ] **Replace placeholder contact details** in `contact.html` and every footer —
      `care@matriamrit.in`, `+91 90000 00000`, and the Bengaluru address are stand-ins.
- [ ] **Replace the `#` social links** in all four footers.
- [ ] **Confirm the pricing.** ₹749 / ₹899 / ₹799 / ₹549 / ₹1,240 / ₹1,890 / ₹680 /
      ₹399 are plausible placeholders, not your numbers.
- [ ] **Legal pages** — Privacy, Terms, Shipping & Returns, Disclaimer are `#` links.
      A food and infant-nutrition business needs the disclaimer in particular.
- [ ] **Verify every health claim** with your vaidya and a paediatrician before
      launch. The copy is deliberately careful — the honey-and-infant-botulism note in
      `samskaras.html` (Jatakarma) is there on purpose and should stay.
- [ ] Add real OG images (`assets/img/og.jpg`) and update the `og:image` meta tags.

## Accessibility

Semantic landmarks, skip link, visible focus rings, ARIA on tabs/accordion/filters,
`aria-live` on the contact form status, alt/`aria-label` on every icon and
illustration, and full `prefers-reduced-motion` support. Verified: zero horizontal
overflow at 375px and 1180px, zero console errors.
