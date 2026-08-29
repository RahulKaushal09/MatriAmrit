/* =====================================================================
   MatriAmrit - dispatch panel

   Lists orders, opens one in detail, moves it along the pack → dispatch
   → delivered sequence, and drafts the WhatsApp message that tells the
   customer about it.

   Everything on screen is drawn with textContent, never innerHTML: this
   page renders names, addresses and notes typed by the public, and an
   admin panel is the last place that should be interpreting them as
   markup.
   ===================================================================== */
(() => {
  'use strict';

  const admin = window.MATRIAMRIT_ADMIN;
  const { money, dateTime, relative, phone: fmtPhone } = admin.fmt;
  const $ = id => document.getElementById(id);

  /* No token, no panel. Checked before anything renders. */
  if (!admin.getToken()) {
    window.location.replace(`${admin.LOGIN_PAGE}?expired=1`);
    return;
  }

  /* ── State ──────────────────────────────────────────────────────── */

  const state = {
    page: 1,
    limit: 25,
    q: '',
    status: '',
    fulfilment: '',
    pages: 1,
    total: 0,
    openOrder: null,     // the full order in the drawer
    loading: false,
  };

  /* ── DOM helpers ────────────────────────────────────────────────── */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /** A definition row: label on the left, value on the right. */
  function kv(label, value, valueClass) {
    const row = el('div', 'ad-kv');
    row.append(el('dt', null, label), el('dd', valueClass || null, value ?? '—'));
    return row;
  }

  function section(title) {
    const wrap = el('section', 'ad-sec');
    wrap.append(el('h3', null, title));
    return wrap;
  }

  /* ── Status vocabulary ──────────────────────────────────────────── */

  const PAYMENT_LABEL = {
    created: 'Awaiting payment',
    paid: 'Paid',
    failed: 'Payment failed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
  };

  const FULFILMENT_LABEL = {
    pending: 'Not packed',
    packed: 'Packed',
    dispatched: 'Dispatched',
    delivered: 'Delivered',
  };

  /* Which moves the server will accept from here. Mirrored from
     admin.service.js - the server refuses anything else regardless. */
  const NEXT_STEPS = {
    pending: ['packed', 'dispatched'],
    packed: ['dispatched', 'delivered', 'pending'],
    dispatched: ['delivered', 'packed'],
    delivered: ['dispatched'],
  };

  const STEP_VERB = {
    pending: 'Move back to not packed',
    packed: 'Mark packed',
    dispatched: 'Mark dispatched',
    delivered: 'Mark delivered',
  };

  /* ── Toast ──────────────────────────────────────────────────────── */

  let toastTimer = null;

  function toast(message, kind = 'ok') {
    const box = $('adToast');
    box.className = `ad-toast ad-toast--${kind}`;
    box.textContent = message;
    box.hidden = false;

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 4000);
  }

  /* ── Stats ──────────────────────────────────────────────────────── */

  async function loadStats() {
    try {
      const s = await admin.get('/admin/stats');
      $('statToday').textContent = String(s.paidToday ?? 0);
      $('statPending').textContent = String(s.fulfilment.pending || 0);
      $('statDispatched').textContent = String(s.fulfilment.dispatched || 0);
      $('statRevenue').textContent = money(s.revenuePaise || 0);
      document.querySelectorAll('.ad-stat').forEach(node => node.classList.remove('is-loading'));
    } catch {
      /* The numbers are a convenience; the order list is the job. */
    }
  }

  /* ── Order list ─────────────────────────────────────────────────── */

  function orderCard(row) {
    const card = el('article', 'ad-card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Open order ${row.orderNumber}`);
    card.dataset.order = row.orderNumber;

    /* Top line: number, when, and the two status pills. */
    const head = el('div', 'ad-card__head');
    const idWrap = el('div', 'ad-card__id');
    idWrap.append(el('strong', null, row.orderNumber), el('span', null, relative(row.placedAt)));

    const pills = el('div', 'ad-card__pills');
    pills.append(
      el('span', `pill pill--${row.status}`, PAYMENT_LABEL[row.status] || row.status),
      el('span', `pill pill--f-${row.fulfilmentStatus}`, FULFILMENT_LABEL[row.fulfilmentStatus])
    );

    head.append(idWrap, pills);

    /* Who and where. */
    const who = el('div', 'ad-card__who');
    who.append(
      el('span', 'ad-card__name', row.customerName),
      el('span', 'ad-card__sep', '·'),
      el('span', null, fmtPhone(row.phone)),
      el('span', 'ad-card__sep', '·'),
      el('span', null, `${row.city} ${row.pincode}`)
    );

    /* What is in the box. */
    const what = el('div', 'ad-card__what', row.itemSummary);

    /* Money. */
    const foot = el('div', 'ad-card__foot');
    const amount = el('span', 'ad-card__amt', money(row.totalPaise));
    foot.append(amount);

    if (row.couponCode) {
      foot.append(el('span', 'ad-card__coupon', `${row.couponCode} · −${money(row.discountPaise)}`));
    }
    foot.append(el('span', 'ad-card__grams', `${row.totalGrams / 1000} kg`));

    card.append(head, who, what, foot);
    return card;
  }

  async function loadOrders() {
    if (state.loading) return;
    state.loading = true;

    const list = $('orderList');
    list.setAttribute('aria-busy', 'true');
    $('adCount').textContent = 'Loading orders…';

    const params = new URLSearchParams({ page: String(state.page), limit: String(state.limit) });
    if (state.q) params.set('q', state.q);
    if (state.status) params.set('status', state.status);
    if (state.fulfilment) params.set('fulfilment', state.fulfilment);

    try {
      const data = await admin.get(`/admin/orders?${params.toString()}`);

      state.pages = data.pages;
      state.total = data.total;

      list.replaceChildren(...data.orders.map(orderCard));

      $('adEmpty').hidden = data.orders.length > 0;
      $('adCount').textContent = data.total
        ? `${data.total} order${data.total === 1 ? '' : 's'}${state.q || state.status || state.fulfilment ? ' matching' : ''}`
        : '';

      $('adPager').hidden = data.pages <= 1;
      $('pageLabel').textContent = `Page ${data.page} of ${data.pages}`;
      $('prevPage').disabled = data.page <= 1;
      $('nextPage').disabled = data.page >= data.pages;
    } catch (err) {
      $('adCount').textContent = '';
      list.replaceChildren(el('p', 'ad-error', `Could not load orders: ${err.message}`));
    } finally {
      state.loading = false;
      list.removeAttribute('aria-busy');
    }
  }

  /* ── Order detail ───────────────────────────────────────────────── */

  function itemsSection(order) {
    const sec = section('Items to pack');
    const list = el('div', 'ad-items');

    order.items.forEach(item => {
      const row = el('div', 'ad-item');
      const left = el('div');
      left.append(
        el('div', 'ad-item__name', `${item.name} · ${item.variantLabel}`),
        el('div', 'ad-item__meta', `${item.quantity} × ${money(item.unitPricePaise)}`)
      );
      row.append(left, el('div', 'ad-item__amt', money(item.lineTotalPaise)));
      list.append(row);
    });

    const totals = el('dl', 'ad-totals');
    totals.append(kv('Subtotal', money(order.amounts.subtotalPaise)));

    if (order.amounts.discountPaise > 0) {
      const label = order.coupon ? `Discount · ${order.coupon.code}` : 'Discount';
      totals.append(kv(label, `− ${money(order.amounts.discountPaise)}`, 'is-discount'));
    }
    if (order.amounts.deliveryFeePaise > 0) {
      totals.append(kv('Delivery', money(order.amounts.deliveryFeePaise)));
    }

    totals.append(kv('Total', money(order.amounts.totalPaise), 'is-total'));

    sec.append(list, el('p', 'ad-weight', `Total weight: ${order.totalGrams / 1000} kg`), totals);
    return sec;
  }

  function deliverySection(order) {
    const sec = section('Deliver to');
    const d = order.delivery;

    const address = el('p', 'ad-address');
    address.textContent = [
      order.customer.name,
      d.addressLine,
      d.landmark ? `Landmark: ${d.landmark}` : null,
      `${d.city}, ${d.state} ${d.pincode}`,
    ].filter(Boolean).join('\n');

    sec.append(address);

    const links = el('div', 'ad-links');

    /* A pin the customer dropped is worth more to a courier than the
       typed address, so it leads. Coordinates are [lng, lat]. */
    if (d.coordinates) {
      const [lng, lat] = d.coordinates;
      const pin = el('a', 'ad-link', '📍 Open the customer’s exact pin');
      pin.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      pin.target = '_blank';
      pin.rel = 'noopener noreferrer';
      links.append(pin);
    }

    const search = el('a', 'ad-link', '🗺 Look up the typed address');
    search.href = `https://www.google.com/maps/search/?api=1&query=${
      encodeURIComponent(`${d.addressLine}, ${d.city}, ${d.state} ${d.pincode}`)}`;
    search.target = '_blank';
    search.rel = 'noopener noreferrer';
    links.append(search);

    sec.append(links);

    if (d.geocodedLabel) {
      sec.append(el('p', 'ad-note', `Pin resolved to: ${d.geocodedLabel}`));
    }
    if (order.customerNote) {
      const note = el('p', 'ad-note ad-note--flag');
      note.textContent = `Customer note: ${order.customerNote}`;
      sec.append(note);
    }

    return sec;
  }

  function contactSection(order) {
    const sec = section('Customer');
    const dl = el('dl', 'ad-dl');

    dl.append(kv('Name', order.customer.name));

    const callRow = el('div', 'ad-kv');
    callRow.append(el('dt', null, 'Phone'));
    const dd = el('dd');
    const tel = el('a', 'ad-link', fmtPhone(order.customer.phone));
    tel.href = `tel:+91${order.customer.phone}`;
    dd.append(tel);
    callRow.append(dd);
    dl.append(callRow);

    if (!order.customer.whatsappSameAsPhone && order.customer.whatsappPhone) {
      dl.append(kv('WhatsApp', fmtPhone(order.customer.whatsappPhone)));
    }
    if (order.customer.email) dl.append(kv('Email', order.customer.email));

    sec.append(dl);
    return sec;
  }

  function paymentSection(order) {
    const sec = section('Payment');
    const dl = el('dl', 'ad-dl');

    dl.append(kv('Status', PAYMENT_LABEL[order.status] || order.status));
    dl.append(kv('Method', order.payment.method ? order.payment.method.toUpperCase() : '—'));
    dl.append(kv('Paid at', order.payment.capturedAt ? dateTime(order.payment.capturedAt) : '—'));
    dl.append(kv('Razorpay payment', order.payment.razorpayPaymentId || '—'));
    dl.append(kv('Razorpay order', order.payment.razorpayOrderId || '—'));

    if (order.payment.refundId) {
      dl.append(kv('Refund', `${order.payment.refundId} · ${dateTime(order.payment.refundedAt)}`));
    }
    if (order.payment.failureReason) {
      dl.append(kv('Last failure', order.payment.failureReason));
    }

    sec.append(dl);

    const failed = order.payment.attempts.filter(a => a.status === 'failed');
    if (failed.length) {
      sec.append(el('p', 'ad-note', `${failed.length} failed attempt${failed.length === 1 ? '' : 's'} on this order.`));
    }

    return sec;
  }

  function dispatchSection(order) {
    const sec = section('Dispatch');
    const f = order.fulfilment;

    const now = el('p', 'ad-fstate');
    now.append(
      el('span', `pill pill--f-${f.status}`, FULFILMENT_LABEL[f.status]),
      el('span', 'ad-fstate__when', f.status === 'pending' ? 'Not packed yet' : relative(
        f.deliveredAt || f.dispatchedAt || f.packedAt
      ))
    );
    sec.append(now);

    if (f.courier || f.trackingRef) {
      const dl = el('dl', 'ad-dl');
      if (f.courier) dl.append(kv('Courier', f.courier));
      if (f.trackingRef) dl.append(kv('Tracking', f.trackingRef));
      sec.append(dl);
    }
    if (f.note) sec.append(el('p', 'ad-note', f.note));

    /* Courier details, only asked for where they mean something. */
    const form = el('div', 'ad-fform');
    const courier = el('input', 'ad-input');
    courier.id = 'fCourier';
    courier.placeholder = 'Courier (e.g. Delhivery, own rider)';
    courier.maxLength = 80;
    courier.value = f.courier || '';

    const tracking = el('input', 'ad-input');
    tracking.id = 'fTracking';
    tracking.placeholder = 'Tracking reference';
    tracking.maxLength = 80;
    tracking.value = f.trackingRef || '';

    const note = el('input', 'ad-input');
    note.id = 'fNote';
    note.placeholder = 'Note for this step (optional)';
    note.maxLength = 300;

    form.append(courier, tracking, note);
    sec.append(form);

    /* What can happen next, and nothing that cannot. */
    const steps = el('div', 'ad-steps');
    const blocked = order.status !== 'paid';

    NEXT_STEPS[f.status].forEach(next => {
      const btn = el('button', next === 'pending' ? 'ad-btn ad-btn--ghost' : 'ad-btn ad-btn--primary',
        STEP_VERB[next]);
      btn.type = 'button';
      btn.dataset.step = next;
      /* An unpaid order can be corrected backwards but never sent out. */
      btn.disabled = blocked && next !== 'pending';
      steps.append(btn);
    });

    sec.append(steps);

    if (blocked) {
      sec.append(el('p', 'ad-note ad-note--flag',
        'This order has not been paid for. Nothing should leave until the payment clears.'));
    }

    /* The audit trail: who moved it, and when. */
    if (f.history.length) {
      const log = el('ol', 'ad-log');
      [...f.history].reverse().forEach(h => {
        const li = el('li');
        li.append(
          el('strong', null, FULFILMENT_LABEL[h.to] || h.to),
          el('span', null, ` · ${h.by} · ${dateTime(h.at)}`)
        );
        if (h.note) li.append(el('em', null, ` — ${h.note}`));
        log.append(li);
      });
      sec.append(el('p', 'ad-label', 'History'), log);
    }

    return sec;
  }

  function renderDrawer(order) {
    state.openOrder = order;

    $('drawerTitle').textContent = order.orderNumber;
    $('drawerEyebrow').textContent = `Placed ${dateTime(order.placedAt)}`;

    $('drawerBody').replaceChildren(
      dispatchSection(order),
      itemsSection(order),
      deliverySection(order),
      contactSection(order),
      paymentSection(order)
    );

    /* The action that gets used most sits in the footer, always visible. */
    const foot = $('drawerFoot');
    const waBtn = el('button', 'ad-btn ad-btn--wa', 'Message on WhatsApp');
    waBtn.type = 'button';
    waBtn.id = 'openWaBtn';

    const copyBtn = el('button', 'ad-btn ad-btn--ghost', 'Copy address');
    copyBtn.type = 'button';
    copyBtn.id = 'copyAddrBtn';

    foot.replaceChildren(copyBtn, waBtn);
  }

  async function openOrder(orderNumber) {
    const drawer = $('drawer');
    drawer.hidden = false;
    document.body.classList.add('is-locked');

    $('drawerTitle').textContent = orderNumber;
    $('drawerEyebrow').textContent = 'Loading…';
    $('drawerBody').replaceChildren(el('p', 'ad-note', 'Loading order…'));
    $('drawerFoot').replaceChildren();

    try {
      const data = await admin.get(`/admin/orders/${orderNumber}`);
      renderDrawer(data.order);
    } catch (err) {
      $('drawerBody').replaceChildren(el('p', 'ad-error', err.message));
    }
  }

  function closeDrawer() {
    $('drawer').hidden = true;
    state.openOrder = null;
    document.body.classList.remove('is-locked');
  }

  /* ── Moving an order along ──────────────────────────────────────── */

  async function advance(to) {
    const order = state.openOrder;
    if (!order) return;

    const body = {
      status: to,
      courier: $('fCourier')?.value.trim() || '',
      trackingRef: $('fTracking')?.value.trim() || '',
      note: $('fNote')?.value.trim() || '',
    };

    document.querySelectorAll('[data-step]').forEach(b => { b.disabled = true; });

    try {
      const data = await admin.patch(`/admin/orders/${order.orderNumber}/fulfilment`, body);
      renderDrawer(data.order);
      toast(`${order.orderNumber} marked ${FULFILMENT_LABEL[to].toLowerCase()}.`);

      /* The list and the counters are now stale. */
      loadOrders();
      loadStats();
    } catch (err) {
      toast(err.message, 'error');
      document.querySelectorAll('[data-step]').forEach(b => { b.disabled = false; });
    }
  }

  /* ── WhatsApp composer ──────────────────────────────────────────── */

  /* Where the customer can check the order themselves. Same link the
     checkout sends them to after paying. */
  function statusUrl(order) {
    const query = new URLSearchParams({
      order: order.orderNumber,
      phone: order.customer.phone.slice(-4),
    });
    return `${window.location.origin}/order-status.html?${query.toString()}`;
  }

  /**
   * The message bank. Each entry knows when it is the obvious one to
   * send, so the composer can preselect it rather than making someone
   * read all six every time.
   */
  function templatesFor(order) {
    const first = (order.customer.name || '').trim().split(/\s+/)[0] || 'ji';
    const items = order.items
      .map(i => `• ${i.quantity} × ${i.name} (${i.variantLabel})`)
      .join('\n');
    const total = money(order.amounts.totalPaise);
    const link = statusUrl(order);
    const f = order.fulfilment.status;
    const paid = order.status === 'paid';

    const sign = '\n\n— Team MatriAmrit 🙏';

    return [
      {
        id: 'payment',
        label: 'Payment pending',
        suggested: !paid,
        text:
          `Namaste ${first} 🙏\n\n` +
          `We have kept your order ${order.orderNumber} aside, but the payment has not reached us yet — ` +
          `no money has been taken from your account.\n\n${items}\n\nAmount due: ${total}\n\n` +
          `Reply here and we will send you a fresh payment link, and your laddus will be on their way the same day. ` +
          `You can check the order any time here:\n${link}${sign}`,
      },
      {
        id: 'confirmed',
        label: 'Order confirmed',
        suggested: paid && f === 'pending',
        text:
          `Namaste ${first} 🙏\n\n` +
          `Thank you — we have received your payment of ${total} and your order ${order.orderNumber} is confirmed.\n\n` +
          `${items}\n\n` +
          `Your laddus are made fresh to order. We will message you again the moment the box leaves our kitchen.\n\n` +
          `Track it here:\n${link}${sign}`,
      },
      {
        id: 'packed',
        label: 'Packed today',
        suggested: paid && f === 'packed',
        text:
          `Namaste ${first} 🙏\n\n` +
          `Good news — order ${order.orderNumber} has been made fresh this morning and is packed and sealed.\n\n` +
          `${items}\n\n` +
          `It goes out for delivery next, and we will send you the tracking details as soon as it leaves.${sign}`,
      },
      {
        id: 'dispatched',
        label: 'Dispatched',
        suggested: paid && f === 'dispatched',
        text:
          `Namaste ${first} 🙏\n\n` +
          `Your order ${order.orderNumber} is on its way! 🚚\n\n${items}\n\n` +
          (order.fulfilment.courier ? `Courier: ${order.fulfilment.courier}\n` : '') +
          (order.fulfilment.trackingRef ? `Tracking: ${order.fulfilment.trackingRef}\n` : '') +
          `\nDelivering to:\n${order.delivery.addressLine}, ${order.delivery.city} ${order.delivery.pincode}\n\n` +
          `Please keep your phone nearby for the delivery call. Track it here:\n${link}${sign}`,
      },
      {
        id: 'delivered',
        label: 'Delivered · feedback',
        suggested: paid && f === 'delivered',
        text:
          `Namaste ${first} 🙏\n\n` +
          `Your order ${order.orderNumber} has been delivered. We hope the laddus bring strength and good health to your family.\n\n` +
          `Store them in a cool, dry place and enjoy one or two a day.\n\n` +
          `If anything is not right, tell us straight away and we will make it right. And if you enjoyed them, ` +
          `we would be grateful if you told one other family about us. 💛${sign}`,
      },
      {
        id: 'address',
        label: 'Check the address',
        suggested: false,
        text:
          `Namaste ${first} 🙏\n\n` +
          `Before we send out order ${order.orderNumber}, could you please confirm this address is correct?\n\n` +
          `${order.delivery.addressLine}\n` +
          (order.delivery.landmark ? `Landmark: ${order.delivery.landmark}\n` : '') +
          `${order.delivery.city}, ${order.delivery.state} ${order.delivery.pincode}\n\n` +
          `Reply "yes" and we will dispatch it today, or send us the correction.${sign}`,
      },
      {
        id: 'blank',
        label: 'Write my own',
        suggested: false,
        text: `Namaste ${first} 🙏\n\n`,
      },
    ];
  }

  function openWhatsApp() {
    const order = state.openOrder;
    if (!order) return;

    const number = order.customer.whatsappPhone || order.customer.phone;
    const templates = templatesFor(order);
    const chosen = templates.find(t => t.suggested) || templates[0];

    $('waTo').textContent = `To ${order.customer.name} · ${fmtPhone(number)}`;
    $('waText').value = chosen.text;

    /* Template chips. The suggested one starts pressed. */
    const chips = templates.map(t => {
      const chip = el('button', 'wa-chip', t.label);
      chip.type = 'button';
      chip.dataset.template = t.id;
      chip.setAttribute('aria-pressed', String(t.id === chosen.id));
      if (t.suggested) chip.classList.add('wa-chip--suggested');
      chip.addEventListener('click', () => {
        $('waText').value = t.text;
        chips.forEach(c => c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', 'true');
        syncWaLink();
        $('waText').focus();
      });
      return chip;
    });

    $('waTemplates').replaceChildren(...chips);

    /* wa.me wants the country code and no punctuation. */
    $('waOpen').dataset.number = `91${String(number).replace(/\D/g, '').slice(-10)}`;
    syncWaLink();

    $('waModal').hidden = false;
    document.body.classList.add('is-locked');
  }

  /* The href is rebuilt on every keystroke so the operator can edit the
     text and still click straight through. */
  function syncWaLink() {
    const link = $('waOpen');
    const number = link.dataset.number;
    link.href = `https://wa.me/${number}?text=${encodeURIComponent($('waText').value)}`;
  }

  function closeWa() {
    $('waModal').hidden = true;
    document.body.classList.remove('is-locked');
  }

  async function copyText(text, okMessage) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMessage);
    } catch {
      /* Clipboard access is refused outside a secure context, and on a
         LAN address that is the normal case rather than an error. */
      toast('Your browser blocked the clipboard. Select the text and copy it.', 'error');
    }
  }

  /* ── Events ─────────────────────────────────────────────────────── */

  /* One listener for the whole list - cards come and go on every load. */
  $('orderList').addEventListener('click', event => {
    const card = event.target.closest('[data-order]');
    if (card) openOrder(card.dataset.order);
  });

  $('orderList').addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-order]');
    if (!card) return;
    event.preventDefault();
    openOrder(card.dataset.order);
  });

  $('drawer').addEventListener('click', event => {
    if (event.target.closest('[data-close-drawer]')) {
      closeDrawer();
      return;
    }

    const step = event.target.closest('[data-step]');
    if (step) advance(step.dataset.step);

    if (event.target.closest('#openWaBtn')) openWhatsApp();

    if (event.target.closest('#copyAddrBtn') && state.openOrder) {
      const o = state.openOrder;
      copyText(
        [o.customer.name, o.delivery.addressLine, o.delivery.landmark,
         `${o.delivery.city}, ${o.delivery.state} ${o.delivery.pincode}`,
         fmtPhone(o.customer.phone)].filter(Boolean).join('\n'),
        'Address copied.'
      );
    }
  });

  $('waModal').addEventListener('click', event => {
    if (event.target.closest('[data-close-wa]')) closeWa();
    if (event.target.closest('#waCopy')) copyText($('waText').value, 'Message copied.');
  });

  $('waText').addEventListener('input', syncWaLink);

  /* Sending it is the end of the composer's job. */
  $('waOpen').addEventListener('click', () => setTimeout(closeWa, 250));

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!$('waModal').hidden) closeWa();
    else if (!$('drawer').hidden) closeDrawer();
  });

  /* Filters. The search waits for a pause in typing rather than firing
     a request per keystroke. */
  let searchTimer = null;

  $('searchInput').addEventListener('input', event => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = event.target.value.trim();
      state.page = 1;
      loadOrders();
    }, 350);
  });

  $('statusFilter').addEventListener('change', event => {
    state.status = event.target.value;
    state.page = 1;
    loadOrders();
  });

  $('fulfilmentFilter').addEventListener('change', event => {
    state.fulfilment = event.target.value;
    state.page = 1;
    loadOrders();
  });

  $('refreshBtn').addEventListener('click', () => { loadOrders(); loadStats(); });

  $('prevPage').addEventListener('click', () => {
    if (state.page > 1) { state.page -= 1; loadOrders(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  $('nextPage').addEventListener('click', () => {
    if (state.page < state.pages) { state.page += 1; loadOrders(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  $('signOutBtn').addEventListener('click', () => {
    admin.clearSession();
    window.location.replace(admin.LOGIN_PAGE);
  });

  /* ── Boot ───────────────────────────────────────────────────────── */

  (async function boot() {
    try {
      const { admin: who } = await admin.get('/admin/me');
      $('adWho').textContent = `${who.username} · ${who.role}`;
    } catch {
      /* A 401 has already redirected; anything else is not worth
         blocking the order list for. */
    }

    await Promise.all([loadOrders(), loadStats()]);
  })();
})();
