/* =====================================================================
   MatriAmrit - checkout

   Reads the basket, asks the server what it costs, collects delivery
   details, then hands the customer to Razorpay Checkout and verifies the
   result server-side.

   The one rule that matters: this file never decides what anything
   costs. It displays what the API returns and sends back only ids and
   quantities. Every figure on screen came from the server.
   ===================================================================== */
(() => {
  'use strict';

  const cfg = window.MATRIAMRIT;
  const catalogue = window.MATRIAMRIT_CATALOGUE;
  const $ = id => document.getElementById(id);

  const form = $('bookingForm');
  if (!form) return;

  const statusBox = $('formStatus');
  const payBtn = $('payBtn');

  /* Server-quoted state. `quote` is the only source of displayed money. */
  let basket = null;
  let quote = null;
  let couponCode = null;   // the code the SERVER has accepted, not what was typed
  let pin = null;          // { lat, lng, label } once the customer drops one
  let submitting = false;
  let couponBusy = false;

  /* ── Small helpers ──────────────────────────────────────────────── */

  const money = paise => catalogue.formatPaise(paise);

  function showStatus(kind, message) {
    statusBox.className = `form-status is-shown form-status--${kind}`;
    statusBox.textContent = message;
    statusBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearStatus() {
    statusBox.className = 'form-status';
    statusBox.textContent = '';
  }

  function clearFieldErrors() {
    form.querySelectorAll('[data-err]').forEach(el => { el.textContent = ''; });
    form.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
    form.querySelectorAll('.phone-input[data-invalid]').forEach(el => el.removeAttribute('data-invalid'));
  }

  /* Maps a server field path - "customer.phone" - onto its input. */
  const FIELD_INPUTS = {
    'customer.name': 'name',
    'customer.phone': 'phone',
    'customer.email': 'email',
    'customer.whatsappPhone': 'waPhone',
    'delivery.addressLine': 'addressLine',
    'delivery.landmark': 'landmark',
    'delivery.city': 'city',
    'delivery.state': 'state',
    'delivery.pincode': 'pincode',
    customerNote: 'customerNote',
  };

  function showFieldError(path, message) {
    const slot = form.querySelector(`[data-err="${CSS.escape(path)}"]`);
    if (slot) slot.textContent = message;

    const input = FIELD_INPUTS[path] ? $(FIELD_INPUTS[path]) : null;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      const wrap = input.closest('.phone-input');
      if (wrap) wrap.setAttribute('data-invalid', 'true');
    }
    return input;
  }

  async function api(path, options = {}) {
    const response = await fetch(cfg.apiBase + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });

    let payload = null;
    try { payload = await response.json(); } catch { /* non-JSON error page */ }

    if (!response.ok || !payload || payload.success === false) {
      const error = new Error(payload?.error?.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.code = payload?.error?.code || null;
      error.details = payload?.error?.details || null;
      throw error;
    }
    return payload.data;
  }

  /* ── 1. Load the basket ─────────────────────────────────────────── */

  function readBasket() {
    /* URL wins over storage - it is how the product page falls back when
       sessionStorage is unavailable. */
    const params = new URLSearchParams(window.location.search);
    if (params.get('product') && params.get('variant')) {
      return {
        items: [{
          productId: params.get('product'),
          variantId: params.get('variant'),
          quantity: Math.min(20, Math.max(1, Number.parseInt(params.get('qty'), 10) || 1)),
        }],
      };
    }

    try {
      const raw = sessionStorage.getItem(cfg.basketKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function renderEmpty() {
    $('summaryCount').textContent = 'Nothing selected';
    $('summaryEmpty').hidden = false;
    $('summaryTotals').hidden = true;
    $('couponBox').hidden = true;
    $('payWrap').hidden = true;
    form.style.opacity = '.5';
    form.style.pointerEvents = 'none';
  }

  /* ── 2. Ask the server for the real totals ──────────────────────── */

  /* One round trip decides everything on screen: line prices, the
     discount, the total, and whether the typed code was any good. */
  async function loadQuote(code = couponCode) {
    quote = await api('/catalogue/quote', {
      method: 'POST',
      body: JSON.stringify({ items: basket.items, couponCode: code || '' }),
    });

    /* Only a code the server honoured is kept. Anything else is dropped
       so it cannot ride along to order creation and fail there. */
    couponCode = quote.coupon ? quote.coupon.code : null;
    storeCoupon(couponCode);

    renderSummary();
    renderCoupon(quote.couponError);
  }

  function renderSummary() {
    const lines = $('summaryLines');

    lines.replaceChildren(
      ...quote.items.map(item => {
        const product = catalogue.getProduct(item.productId);
        const row = document.createElement('div');
        row.className = 'summary__line';
        row.innerHTML = `
          <img class="summary__thumb" src="${product ? product.image : ''}" alt="" loading="lazy">
          <div class="summary__info">
            <div class="summary__name"></div>
            <div class="summary__meta"></div>
          </div>
          <div class="summary__amt"></div>`;
        row.querySelector('.summary__name').textContent = item.name;
        row.querySelector('.summary__meta').textContent =
          `${item.variantLabel} box × ${item.quantity} · ${money(item.unitPricePaise)} each`;
        row.querySelector('.summary__amt').textContent = money(item.lineTotalPaise);
        return row;
      })
    );

    const kilos = quote.totalGrams / 1000;
    $('summaryCount').textContent =
      `${kilos % 1 === 0 ? kilos : kilos.toFixed(2)} kg · delivery included`;

    /* Delivery is included in the pack price, so with no coupon the
       summary shows a single number. A discount adds the two rows that
       explain it. Every figure here came from the server. */
    const discountPaise = quote.amounts.discountPaise || 0;

    $('rowSubtotal').hidden = discountPaise === 0;
    $('rowDiscount').hidden = discountPaise === 0;

    if (discountPaise > 0) {
      $('sumSubtotal').textContent = money(quote.amounts.subtotalPaise);
      $('discountLabel').textContent = quote.coupon ? `Discount · ${quote.coupon.code}` : 'Discount';
      $('sumDiscount').textContent = `− ${money(discountPaise)}`;
    }

    $('sumTotal').textContent = money(quote.amounts.totalPaise);

    $('summaryEmpty').hidden = true;
    $('summaryTotals').hidden = false;
    $('couponBox').hidden = false;
    $('payWrap').hidden = false;
  }

  /* ── 2b. Coupon code ────────────────────────────────────────────── */

  /* Kept beside the basket so a refresh mid-checkout does not lose it.
     Storage being unavailable is not an error - it just means the code
     has to be typed again. */
  function storeCoupon(code) {
    try {
      if (code) sessionStorage.setItem(cfg.couponKey, code);
      else sessionStorage.removeItem(cfg.couponKey);
    } catch { /* private mode, or storage disabled */ }
  }

  function readStoredCoupon() {
    try { return sessionStorage.getItem(cfg.couponKey) || null; } catch { return null; }
  }

  function setCouponMessage(kind, message) {
    const msg = $('couponMsg');
    msg.className = message ? `coupon__msg coupon__msg--${kind}` : 'coupon__msg';
    msg.textContent = message || '';
  }

  function setCouponBusy(busy) {
    couponBusy = busy;
    $('couponApply').disabled = busy;
    $('couponRemove').disabled = busy;
    $('couponInput').disabled = busy;
    $('couponApply').textContent = busy ? 'Checking…' : 'Apply';
  }

  /* Draws whichever half of the box applies: the entry field, or the
     applied chip. `error` is the server's reason a code was refused. */
  function renderCoupon(error) {
    const applied = quote && quote.coupon;

    $('couponEntry').hidden = Boolean(applied);
    $('couponApplied').hidden = !applied;

    if (applied) {
      $('couponInput').value = '';
      $('couponCodeOut').textContent = applied.code;
      $('couponLabelOut').textContent = applied.label;
      setCouponMessage('ok', `${money(quote.amounts.discountPaise)} off this order.`);
      return;
    }

    setCouponMessage('error', error ? error.message : '');
  }

  async function applyCoupon(code) {
    if (couponBusy) return;

    const typed = String(code || '').trim().toUpperCase();
    if (!typed) {
      setCouponMessage('error', 'Enter a coupon code first.');
      $('couponInput').focus();
      return;
    }

    setCouponBusy(true);
    setCouponMessage('info', 'Checking that code…');

    try {
      await loadQuote(typed);
    } catch (err) {
      /* The quote itself failed - the basket, or the network. The code is
         not blamed for it and the totals already on screen still stand. */
      setCouponMessage('error', err.message || 'We could not check that code. Please try again.');
    } finally {
      setCouponBusy(false);
    }
  }

  async function removeCoupon() {
    if (couponBusy) return;

    setCouponBusy(true);
    try {
      await loadQuote(null);
      setCouponMessage('info', 'Coupon removed.');
    } catch (err) {
      setCouponMessage('error', err.message || 'We could not update the total. Please try again.');
    } finally {
      /* Re-enable before focusing - a disabled input cannot take focus. */
      setCouponBusy(false);
      if (!$('couponEntry').hidden) $('couponInput').focus();
    }
  }

  $('couponApply').addEventListener('click', () => applyCoupon($('couponInput').value));
  $('couponRemove').addEventListener('click', removeCoupon);

  /* The field sits outside the booking form, so Enter has to be wired up
     by hand - and must never reach the form's submit handler. */
  $('couponInput').addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyCoupon(event.target.value);
  });

  $('couponInput').addEventListener('input', event => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });

  /* ── 3. Leaflet map (optional pin) ──────────────────────────────── */

  const INDIA_CENTRE = [22.9734, 78.6569];
  let map = null;
  let marker = null;

  function setMapStatus(html) { $('mapStatus').innerHTML = html; }

  function initMap() {
    if (typeof window.L === 'undefined') {
      setMapStatus('The map could not load. Your typed address is all we need.');
      return;
    }

    map = window.L.map('map', { scrollWheelZoom: false }).setView(INDIA_CENTRE, 4);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    map.on('click', e => dropPin(e.latlng.lat, e.latlng.lng));
  }

  async function dropPin(lat, lng, zoom = 16) {
    pin = { lat, lng, label: null };

    if (!marker) {
      marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        dropPin(p.lat, p.lng, map.getZoom());
      });
    } else {
      marker.setLatLng([lat, lng]);
    }

    map.setView([lat, lng], zoom);
    $('clearPinBtn').hidden = false;
    setMapStatus('Pin dropped. Looking up the address…');

    /* Reverse geocoding is a convenience. If it fails, the pin still
       counts - the coordinates are what help the courier. */
    try {
      const place = await api(`/orders/geo/reverse?lat=${lat}&lng=${lng}`);
      if (place.available && place.label) {
        pin.label = place.label;
        setMapStatus(`<strong>Pin dropped:</strong> ${escapeHtml(place.label)}`);
        prefillFromPlace(place);
      } else {
        setMapStatus(`<strong>Pin dropped</strong> at ${lat.toFixed(5)}, ${lng.toFixed(5)}.`);
      }
    } catch {
      setMapStatus(`<strong>Pin dropped</strong> at ${lat.toFixed(5)}, ${lng.toFixed(5)}.`);
    }
  }

  /* Only fills fields the customer has left blank - never overwrites
     what someone has typed. */
  function prefillFromPlace(place) {
    const maybeSet = (id, value) => {
      const el = $(id);
      if (el && !el.value.trim() && value) el.value = value;
    };
    maybeSet('city', place.city);
    maybeSet('state', place.state);
    maybeSet('pincode', place.pincode);
  }

  function clearPin() {
    pin = null;
    if (marker && map) { map.removeLayer(marker); marker = null; }
    $('clearPinBtn').hidden = true;
    setMapStatus('No pin dropped. Click the map, or use the button above.');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  $('locateBtn').addEventListener('click', () => {
    if (!map) return;
    if (!navigator.geolocation) {
      setMapStatus('Your browser will not share a location. Click the map instead.');
      return;
    }
    setMapStatus('Asking your browser for your location…');
    navigator.geolocation.getCurrentPosition(
      position => dropPin(position.coords.latitude, position.coords.longitude, 17),
      () => setMapStatus('We could not get your location. Click the map to place the pin yourself.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  $('clearPinBtn').addEventListener('click', clearPin);

  /* ── 4. WhatsApp toggle ─────────────────────────────────────────── */

  $('waSame').addEventListener('change', event => {
    $('waWrap').hidden = event.target.checked;
    if (event.target.checked) $('waPhone').value = '';
  });

  /* ── 5. Client-side validation (a courtesy, not the gate) ───────── */

  const digitsOnly = value => value.replace(/\D/g, '');

  ['phone', 'waPhone'].forEach(id => {
    $(id).addEventListener('input', event => {
      event.target.value = digitsOnly(event.target.value).slice(0, 10);
    });
  });
  $('pincode').addEventListener('input', event => {
    event.target.value = digitsOnly(event.target.value).slice(0, 6);
  });

  function validateLocally() {
    const errors = [];
    const value = id => $(id).value.trim();

    if (value('name').length < 2) errors.push(['customer.name', 'Please tell us your name']);
    if (!/^[6-9]\d{9}$/.test(value('phone'))) {
      errors.push(['customer.phone', 'Enter a valid 10-digit Indian mobile number']);
    }
    if (value('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value('email'))) {
      errors.push(['customer.email', 'Enter a valid email address, or leave it blank']);
    }
    if (!$('waSame').checked && !/^[6-9]\d{9}$/.test(value('waPhone'))) {
      errors.push(['customer.whatsappPhone', 'Enter the WhatsApp number, or tick the box above']);
    }
    if (value('addressLine').length < 8) {
      errors.push(['delivery.addressLine', 'Please give the full address - flat, street and area']);
    }
    if (value('city').length < 2) errors.push(['delivery.city', 'Which city?']);
    if (value('state').length < 2) errors.push(['delivery.state', 'Which state?']);
    if (!/^[1-9]\d{5}$/.test(value('pincode'))) {
      errors.push(['delivery.pincode', 'Enter a valid 6-digit PIN code']);
    }
    return errors;
  }

  function collectPayload() {
    const value = id => $(id).value.trim();
    return {
      customer: {
        name: value('name'),
        phone: value('phone'),
        whatsappSameAsPhone: $('waSame').checked,
        ...($('waSame').checked ? {} : { whatsappPhone: value('waPhone') }),
        email: value('email'),
      },
      delivery: {
        addressLine: value('addressLine'),
        landmark: value('landmark'),
        city: value('city'),
        state: value('state'),
        pincode: value('pincode'),
        ...(pin ? { location: { lat: pin.lat, lng: pin.lng, label: pin.label } } : {}),
      },
      items: basket.items,
      customerNote: value('customerNote'),
      /* The code only. The server re-prices it and is free to refuse. */
      couponCode: couponCode || '',
      website: $('website').value,   // honeypot, expected to be empty
    };
  }

  function setBusy(busy) {
    submitting = busy;
    payBtn.classList.toggle('is-busy', busy);
    payBtn.disabled = busy;
  }

  /* ── 6. Submit -> create order -> Razorpay -> verify ─────────────── */

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;

    clearStatus();
    clearFieldErrors();

    const localErrors = validateLocally();
    if (localErrors.length) {
      let firstInput = null;
      localErrors.forEach(([path, message]) => {
        const input = showFieldError(path, message);
        if (!firstInput) firstInput = input;
      });
      showStatus('error', 'Please correct the highlighted fields.');
      firstInput?.focus();
      return;
    }

    if (typeof window.Razorpay === 'undefined') {
      showStatus('error', 'The payment window could not load. Check your connection, or order on WhatsApp.');
      return;
    }

    setBusy(true);

    let order;
    try {
      /* The server re-prices everything here. Whatever the summary said,
         `order.razorpay.amount` is the figure that will be charged. */
      order = await api('/orders', { method: 'POST', body: JSON.stringify(collectPayload()) });
    } catch (err) {
      setBusy(false);

      /* A coupon that expired or ran out between quoting and paying.
         Drop it, re-price at full rate and let the customer decide. */
      if (err.code === 'COUPON_INVALID') {
        couponCode = null;
        storeCoupon(null);
        loadQuote(null).catch(() => { /* the summary keeps its last figures */ });
        setCouponMessage('error', err.message);
        showStatus('error', `${err.message} Your total has been updated - check it before paying.`);
        return;
      }

      if (err.details && Array.isArray(err.details)) {
        let firstInput = null;
        err.details.forEach(detail => {
          const input = showFieldError(detail.field, detail.message);
          if (!firstInput) firstInput = input;
        });
        firstInput?.focus();
      }
      showStatus('error', err.message || 'We could not start your booking. Please try again.');
      return;
    }

    openRazorpay(order);
  });

  function openRazorpay(order) {
    const options = {
      key: order.razorpay.keyId,          // the public key id, never the secret
      order_id: order.razorpay.orderId,
      amount: order.razorpay.amount,
      currency: order.razorpay.currency,
      name: 'MatriAmrit',
      description: order.items.map(i => `${i.quantity}× ${i.name} ${i.variantLabel}`).join(', ').slice(0, 240),
      image: `${window.location.origin}/assets/img/logo/logoMatri.png`,
      prefill: {
        name: order.prefill.name,
        contact: order.prefill.contact,
        email: order.prefill.email,
      },
      notes: { orderNumber: order.orderNumber },
      theme: { color: '#8E2F2A' },
      retry: { enabled: true, max_count: 2 },

      /* Razorpay says the payment succeeded. We do not believe it until
         the server has checked the signature and reconciled the amount. */
      handler: response => verifyPayment(order, response),

      modal: {
        ondismiss: () => {
          setBusy(false);
          showStatus('info', 'Payment window closed. Your details are still here - press "Pay securely" when you are ready.');
          reportFailure(order.orderNumber, null, 'checkout_dismissed');
        },
        escape: true,
        confirm_close: true,
      },
    };

    const checkout = new window.Razorpay(options);

    checkout.on('payment.failed', response => {
      setBusy(false);
      const reason = response?.error?.description || 'Payment failed';
      showStatus('error', `${reason}. No money has been taken. You can try again, or a different method.`);
      reportFailure(order.orderNumber, response?.error?.metadata?.payment_id, reason);
    });

    checkout.open();
  }

  async function verifyPayment(order, response) {
    showStatus('info', 'Payment received. Confirming your order…');

    try {
      await api(`/orders/${order.orderNumber}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        }),
      });

      /* Confirmed. Clear the basket so a refresh cannot re-order, and
         the coupon with it so it is not reused on the next basket. */
      try { sessionStorage.removeItem(cfg.basketKey); } catch { /* ignore */ }
      storeCoupon(null);

      const query = new URLSearchParams({
        order: order.orderNumber,
        phone: order.prefill.contact.slice(-4),
      });
      window.location.href = `order-status.html?${query.toString()}`;
    } catch (err) {
      setBusy(false);
      /* The money may well have left their account. Never tell someone
         to simply pay again - hand them the reference instead. */
      showStatus(
        'error',
        `We took your payment but could not confirm it automatically. Please do NOT pay again. ` +
        `Quote order ${order.orderNumber} on WhatsApp (+91 78384 41441) and we will sort it out immediately. (${err.message})`
      );
    }
  }

  function reportFailure(orderNumber, paymentId, reason) {
    /* Best-effort telemetry - never blocks the customer. */
    api(`/orders/${orderNumber}/payment-failed`, {
      method: 'POST',
      body: JSON.stringify({
        razorpay_payment_id: paymentId || null,
        reason: String(reason).slice(0, 300),
      }),
    }).catch(() => { /* ignore */ });
  }

  /* ── 7. Boot ────────────────────────────────────────────────────── */

  (async function boot() {
    basket = readBasket();

    if (!basket) {
      renderEmpty();
      return;
    }

    /* ?coupon=CODE lets a campaign link arrive with the code filled in.
       It is still checked by the server like any other. */
    const urlCoupon = new URLSearchParams(window.location.search).get('coupon');
    couponCode = (urlCoupon || readStoredCoupon() || '').trim().toUpperCase() || null;

    initMap();

    try {
      await loadQuote();
    } catch (err) {
      renderEmpty();
      showStatus(
        'error',
        `We could not reach our booking service (${err.message}). Please try again shortly, or order on WhatsApp at +91 78384 41441.`
      );
    }
  })();
})();
