/* =====================================================================
   MatriAmrit - product detail page

   Renders from the static catalogue in js/catalogue.js, so the page is
   readable with the API down. Nothing here decides a price that matters:
   the figure shown is a preview and the server re-prices the basket at
   checkout.
   ===================================================================== */
(() => {
  'use strict';

  const root = document.getElementById('pdpRoot');
  if (!root) return;

  const catalogue = window.MATRIAMRIT_CATALOGUE;
  const cfg = window.MATRIAMRIT;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const slot = key => root.querySelector(`[data-pdp="${key}"]`);

  /* ── Which product? ─────────────────────────────────────────────── */

  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get('id');
  const product = requestedId ? catalogue.getProduct(requestedId) : catalogue.products[0];

  if (!product) {
    document.getElementById('pdpMissing').hidden = false;
    document.title = 'Product not found - MatriAmrit';
    return;
  }

  root.hidden = false;

  /* ── Static content ─────────────────────────────────────────────── */

  document.title = `${product.name} - MatriAmrit`;
  const metaDesc = $('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute(
      'content',
      `${product.name} - ${product.tagline}. ${product.audience} Order online with secure Razorpay payment.`
    );
  }

  slot('crumb').textContent = product.name;
  slot('badge').textContent = product.badge;
  slot('tagline').textContent = product.tagline;
  slot('name').textContent = product.name;
  slot('devanagari').textContent = product.devanagari;
  slot('subtitle').textContent = product.subtitle;
  slot('summary').innerHTML = product.summary;      // trusted, authored copy
  slot('ingredientsHeading').textContent = product.ingredientsHeading;

  slot('paramparaTitle').textContent = product.parampara.title;
  slot('paramparaBody').innerHTML = product.parampara.body;   // authored copy
  slot('paramparaMantra').textContent = product.parampara.mantra;
  slot('paramparaClosing').textContent = product.parampara.closing;
  slot('story').textContent = product.story;
  slot('storage').textContent = product.storage;
  slot('allergens').textContent = product.allergens;
  slot('rate').innerHTML = `${catalogue.formatRupees(product.ratePerKg)} <small>per kg</small>`;

  const media = slot('media');
  media.style.background = product.mediaBackground;
  const image = slot('image');
  image.src = product.image;
  image.alt = product.imageAlt;

  const fill = (key, items, tag = 'li') => {
    const target = slot(key);
    target.replaceChildren(
      ...items.map(text => {
        const el = document.createElement(tag);
        el.textContent = text;
        return el;
      })
    );
  };
  fill('howToUse', product.howToUse);

  /* Built with DOM nodes rather than a template string: ingredient text
     is authored, but this keeps it impossible for a stray character to
     become markup. */
  slot('ingredients').replaceChildren(
    ...product.ingredients.map(item => {
      const li = document.createElement('li');

      const name = document.createElement('span');
      name.className = 'ing__name';
      name.textContent = item.name;

      const deva = document.createElement('span');
      deva.className = 'ing__deva';
      deva.textContent = item.deva;
      deva.lang = 'hi';

      const note = document.createElement('span');
      note.className = 'ing__note';
      note.textContent = item.note;

      li.append(name, deva, note);
      return li;
    })
  );

  /* FAQ markup matches the accordion module in main.js, so it wires
     itself up without any extra code here. */
  slot('faqs').innerHTML = product.faqs
    .map(
      (item, i) => `
      <div class="faq-item">
        <button class="faq-q" type="button" aria-expanded="false" aria-controls="pdpFaq${i}">
          ${escapeHtml(item.q)}<i aria-hidden="true"></i>
        </button>
        <div class="faq-a" id="pdpFaq${i}">
          <div><p>${escapeHtml(item.a)}</p></div>
        </div>
      </div>`
    )
    .join('');

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  /* ── Variant picker ─────────────────────────────────────────────── */

  const defaultVariant =
    product.variants.find(v => v.popular) || product.variants[0];

  const singleVariant = product.variants.length === 1;

  /* With one pack size there is nothing to choose. Show it as a fact and
     retire the radiogroup, rather than rendering a group of one. */
  if (singleVariant) {
    const only = product.variants[0];
    const group = slot('variants');
    group.removeAttribute('role');
    group.removeAttribute('aria-labelledby');
    group.classList.add('picker__opts--single');
    group.innerHTML = `
      <div class="picker__solo">
        <span class="picker__size">${escapeHtml(only.label)} box</span>
        <span class="picker__cost">${catalogue.formatRupees(only.price)}</span>
        <span class="picker__note">${escapeHtml(only.note || '')}</span>
      </div>`;
    document.getElementById('sizeLabel').textContent = 'Box size';
  } else {
    slot('variants').innerHTML = product.variants
      .map(v => {
        const flag = v.bestValue ? 'Best value' : v.popular ? 'Most ordered' : '';
        return `
        <label class="picker__opt">
          ${flag ? `<span class="picker__flag">${flag}</span>` : ''}
          <input type="radio" name="variant" value="${v.id}" ${v.id === defaultVariant.id ? 'checked' : ''}>
          <span class="picker__box">
            <span class="picker__size">${escapeHtml(v.label)}</span>
            <span class="picker__cost">${catalogue.formatRupees(v.price)}</span>
            <span class="picker__note">${escapeHtml(v.note || '')}</span>
          </span>
        </label>`;
      })
      .join('');
  }

  /* ── Quantity + live line total ─────────────────────────────────── */

  const form = document.getElementById('buyForm');
  const qtyInput = document.getElementById('qtyInput');
  const lineTotal = slot('lineTotal');
  const MIN_QTY = 1;
  const MAX_QTY = 20;

  const selectedVariant = () => {
    const checked = form.querySelector('input[name="variant"]:checked');
    return catalogue.getVariant(product.id, checked ? checked.value : defaultVariant.id);
  };

  /* With one box size, quantity is the only way to order more. */
  if (singleVariant) {
    form.querySelector('label[for="qtyInput"]').textContent = 'How many boxes?';
  }

  const readQty = () => {
    const n = Number.parseInt(qtyInput.value, 10);
    if (!Number.isFinite(n)) return MIN_QTY;
    return Math.min(MAX_QTY, Math.max(MIN_QTY, n));
  };

  function render() {
    const qty = readQty();
    qtyInput.value = String(qty);

    const variant = selectedVariant();
    const totalPaise = Math.round(variant.price * 100) * qty;

    lineTotal.innerHTML =
      `<small>Total for this item</small>${catalogue.formatPaise(totalPaise)}`;

    form.querySelector('[data-qty="down"]').disabled = qty <= MIN_QTY;
    form.querySelector('[data-qty="up"]').disabled = qty >= MAX_QTY;
  }

  form.addEventListener('change', render);
  qtyInput.addEventListener('input', render);

  form.querySelector('[data-qty="down"]').addEventListener('click', () => {
    qtyInput.value = String(readQty() - 1);
    render();
  });
  form.querySelector('[data-qty="up"]').addEventListener('click', () => {
    qtyInput.value = String(readQty() + 1);
    render();
  });

  render();

  /* ── Hand off to checkout ───────────────────────────────────────── */

  form.addEventListener('submit', event => {
    event.preventDefault();

    const variant = selectedVariant();
    const basket = {
      items: [{ productId: product.id, variantId: variant.id, quantity: readQty() }],
      savedAt: Date.now(),
    };

    try {
      sessionStorage.setItem(cfg.basketKey, JSON.stringify(basket));
    } catch {
      /* Private mode, or storage disabled. Pass the selection in the URL
         instead so the customer is not stopped by a browser setting. */
      const q = new URLSearchParams({
        product: product.id,
        variant: variant.id,
        qty: String(readQty()),
      });
      window.location.href = `checkout.html?${q.toString()}`;
      return;
    }

    window.location.href = 'checkout.html';
  });
})();
