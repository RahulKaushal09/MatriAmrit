/* =====================================================================
   MatriAmrit - order status

   Two ways in: the redirect after a successful payment (order number and
   phone digits in the URL), or the lookup form. Both hit the same
   endpoint, which requires the order number AND the last four digits of
   the phone - knowing a reference alone is never enough to read someone
   else's order.
   ===================================================================== */
(() => {
  'use strict';

  const cfg = window.MATRIAMRIT;
  const catalogue = window.MATRIAMRIT_CATALOGUE;
  const $ = id => document.getElementById(id);

  if (!$('osResult')) return;

  const money = paise => catalogue.formatPaise(paise);

  function show(which) {
    ['osLoading', 'osLookup', 'osResult', 'osError'].forEach(id => {
      $(id).hidden = id !== which;
    });
  }

  async function fetchOrder(orderNumber, phoneLast4) {
    const url = `${cfg.apiBase}/orders/${encodeURIComponent(orderNumber)}?phoneLast4=${encodeURIComponent(phoneLast4)}`;
    const response = await fetch(url);

    let payload = null;
    try { payload = await response.json(); } catch { /* ignore */ }

    if (!response.ok || !payload || payload.success === false) {
      throw new Error(payload?.error?.message || 'We could not find that order.');
    }
    return payload.data.order;
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  const PRESENTATION = {
    paid: {
      mark: 'status-mark--ok',
      icon: '<path d="m5 13 4 4L19 7"/>',
      eyebrow: 'Confirmed',
      title: 'Your order is confirmed',
      message: 'Payment received. We start preparing your batch now and will send a tracking link on WhatsApp once it ships.',
      pill: 'status-pill--paid',
      pillText: 'Paid',
    },
    created: {
      mark: 'status-mark--wait',
      icon: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
      eyebrow: 'Awaiting payment',
      title: 'This order is not paid yet',
      message: 'We are holding it. If you were interrupted mid-payment, message us on WhatsApp and we will send you a fresh payment link.',
      pill: 'status-pill--created',
      pillText: 'Pending',
    },
    failed: {
      mark: 'status-mark--fail',
      icon: '<path d="M18 6 6 18M6 6l12 12"/>',
      eyebrow: 'Payment not completed',
      title: 'The payment did not go through',
      message: 'No money was taken. You can place the order again, or message us on WhatsApp and we will take it manually.',
      pill: 'status-pill--failed',
      pillText: 'Failed',
    },
    cancelled: {
      mark: 'status-mark--fail',
      icon: '<path d="M18 6 6 18M6 6l12 12"/>',
      eyebrow: 'Cancelled',
      title: 'This order was cancelled',
      message: 'If that was not you, message us on WhatsApp straight away.',
      pill: 'status-pill--failed',
      pillText: 'Cancelled',
    },
    refunded: {
      mark: 'status-mark--wait',
      icon: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
      eyebrow: 'Refunded',
      title: 'This order has been refunded',
      message: 'The amount is on its way back to your original payment method, usually within 5–7 working days.',
      pill: 'status-pill--failed',
      pillText: 'Refunded',
    },
  };

  function render(order) {
    const view = PRESENTATION[order.status] || PRESENTATION.created;

    const mark = $('osMark');
    mark.className = `status-mark ${view.mark}`;
    mark.innerHTML =
      `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${view.icon}</svg>`;

    $('osEyebrow').textContent = view.eyebrow;
    $('osTitle').textContent = view.title;
    $('osMessage').textContent = view.message;
    $('osRef').textContent = order.orderNumber;
    document.title = `${order.orderNumber} · ${view.eyebrow} - MatriAmrit`;

    /* Items */
    $('osItems').replaceChildren(
      ...order.items.map(item => {
        const row = document.createElement('div');
        row.className = 'kv';
        const dt = document.createElement('dt');
        dt.textContent = `${item.name} · ${item.variantLabel} × ${item.quantity}`;
        const dd = document.createElement('dd');
        dd.textContent = money(item.lineTotalPaise);
        row.append(dt, dd);
        return row;
      })
    );

    /* Only shown when a coupon was actually honoured, so an ordinary
       order keeps its single-figure summary. */
    const discountPaise = order.amounts.discountPaise || 0;
    $('osDiscountRow').hidden = discountPaise === 0;
    if (discountPaise > 0) {
      $('osDiscountLabel').textContent =
        order.coupon ? `Coupon · ${order.coupon.code}` : 'Coupon discount';
      $('osDiscount').textContent = `− ${money(discountPaise)}`;
    }

    $('osTotal').textContent = money(order.amounts.totalPaise);

    /* Delivery */
    const d = order.delivery;
    $('osAddress').textContent = [
      d.addressLine,
      d.landmark,
      `${d.city}, ${d.state} ${d.pincode}`,
    ].filter(Boolean).join('\n');
    $('osAddress').style.whiteSpace = 'pre-line';

    $('osName').textContent = order.customer.name;
    $('osPhone').textContent = order.customer.phoneMasked;

    /* Payment */
    const pill = $('osPill');
    pill.className = `status-pill ${view.pill}`;
    pill.textContent = view.pillText;

    $('osMethod').textContent = order.payment.method
      ? order.payment.method.toUpperCase()
      : '—';
    $('osPlaced').textContent = new Date(order.placedAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

    show('osResult');
  }

  /* ── Copy the reference ─────────────────────────────────────────── */

  $('osCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('osRef').textContent.trim());
      const button = $('osCopy');
      const original = button.innerHTML;
      button.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>';
      setTimeout(() => { button.innerHTML = original; }, 1600);
    } catch {
      /* Clipboard blocked - the number is on screen to copy by hand. */
    }
  });

  /* ── Lookup form ────────────────────────────────────────────────── */

  const lookupForm = $('lookupForm');
  const lookupStatus = $('lookupStatus');

  $('lookupPhone').addEventListener('input', event => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
  });
  $('lookupOrder').addEventListener('input', event => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });

  lookupForm.addEventListener('submit', async event => {
    event.preventDefault();

    const orderNumber = $('lookupOrder').value.trim().toUpperCase();
    const phoneLast4 = $('lookupPhone').value.trim();

    if (!/^MA-\d{6}-[A-Z0-9]{6}$/.test(orderNumber) || !/^\d{4}$/.test(phoneLast4)) {
      lookupStatus.className = 'form-status is-shown form-status--error';
      lookupStatus.textContent = 'Please check the order number and the 4 phone digits.';
      return;
    }

    lookupStatus.className = 'form-status is-shown form-status--info';
    lookupStatus.textContent = 'Looking…';

    try {
      render(await fetchOrder(orderNumber, phoneLast4));
    } catch (err) {
      lookupStatus.className = 'form-status is-shown form-status--error';
      lookupStatus.textContent = err.message;
    }
  });

  /* ── Boot ───────────────────────────────────────────────────────── */

  (async function boot() {
    const params = new URLSearchParams(window.location.search);
    const orderNumber = params.get('order');
    const phoneLast4 = params.get('phone');

    if (!orderNumber || !phoneLast4) {
      show('osLookup');
      return;
    }

    try {
      render(await fetchOrder(orderNumber, phoneLast4));
    } catch (err) {
      $('osErrorMsg').textContent = `${err.message} You can also look it up below, or message us on WhatsApp.`;
      show('osError');
    }
  })();
})();
