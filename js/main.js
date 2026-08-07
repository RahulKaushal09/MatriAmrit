/* =====================================================================
   MatriAmrit — interaction layer
   Vanilla JS, no dependencies. Every module guards its own selectors so
   the same file can be dropped on every page.
   ===================================================================== */
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. Seamless marquees ───────────────────────────────────────
     CSS animates the track to translateX(-50%), so the content must
     appear exactly twice for the loop to be invisible.              */
  $$('[data-marquee]').forEach(track => {
    track.append(...[...track.children].map(node => {
      const clone = node.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      return clone;
    }));
  });

  /* ── 2. Sticky nav state + scroll progress ─────────────────────── */
  const nav      = $('#nav');
  const progress = $('#progress');
  const toTop    = $('#toTop');

  const onScroll = () => {
    const y = window.scrollY;
    if (nav) nav.classList.toggle('is-stuck', y > 12);
    if (toTop) toTop.classList.toggle('is-in', y > 700);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = `${max > 0 ? (y / max) * 100 : 0}%`;
    }
  };

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });
  onScroll();

  toTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });

  /* ── 3. Mobile drawer ───────────────────────────────────────────── */
  const burger = $('#burger');
  const drawer = $('#drawer');

  const setDrawer = open => {
    if (!burger || !drawer) return;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    drawer.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };

  burger?.addEventListener('click', () => {
    setDrawer(burger.getAttribute('aria-expanded') !== 'true');
  });
  drawer && $$('a', drawer).forEach(a => a.addEventListener('click', () => setDrawer(false)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') setDrawer(false);
  });

  /* ── 4. Scroll reveal ───────────────────────────────────────────── */
  const revealables = $$('[data-reveal]');
  if (revealables.length) {
    if (reduced || !('IntersectionObserver' in window)) {
      revealables.forEach(el => el.classList.add('is-in'));
    } else {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          obs.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
      revealables.forEach(el => io.observe(el));
    }
  }

  /* ── 5. Animated stat counters ──────────────────────────────────── */
  const counters = $$('[data-count]');
  if (counters.length) {
    const run = el => {
      const target = Number(el.dataset.count);
      if (reduced || target === 0) { el.textContent = String(target); return; }
      const duration = 1400;
      const start = performance.now();
      const tick = now => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);          // easeOutCubic
        el.textContent = String(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if ('IntersectionObserver' in window) {
      const co = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          run(entry.target);
          obs.unobserve(entry.target);
        });
      }, { threshold: 0.6 });
      counters.forEach(el => co.observe(el));
    } else {
      counters.forEach(run);
    }
  }

  /* ── 6. Journey stage tabs ──────────────────────────────────────── */
  const tabs = $$('.stage-btn');
  if (tabs.length) {
    const select = tab => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    };

    tabs.forEach((tab, i) => {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', e => {
        const map = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
        if (!(e.key in map)) return;
        e.preventDefault();
        const step = map[e.key];
        const next = step === 'first' ? tabs[0]
                   : step === 'last'  ? tabs[tabs.length - 1]
                   : tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        select(next);
      });
    });
  }

  /* ── 7. Filtering (products grid + samskara timeline) ───────────
     One generic module, configured per filter-group.               */
  const filterGroups = [
    { btn: '[data-filter]', item: '.prod',    key: 'cat',    empty: '#prodEmpty' },
    { btn: '[data-tl]',     item: '.tl-item', key: 'period', empty: '#tlEmpty'   }
  ];

  filterGroups.forEach(({ btn, item, key, empty }) => {
    const buttons = $$(`.filter${btn}`);
    if (!buttons.length) return;

    const items    = $$(item);
    const emptyMsg = $(empty);
    const attr     = buttons[0].dataset.filter !== undefined ? 'filter' : 'tl';

    buttons.forEach(button => button.addEventListener('click', () => {
      const value = button.dataset[attr];
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));

      let shown = 0;
      items.forEach(el => {
        const match = value === 'all' || el.dataset[key] === value;
        el.classList.toggle('is-hidden', !match);
        if (!match) return;
        shown++;
        if (reduced) return;
        el.style.animation = 'none';
        void el.offsetWidth;                           // force reflow
        el.style.animation = 'rise .5s var(--ease) both';
      });
      if (emptyMsg) emptyMsg.hidden = shown !== 0;
    }));
  });

  /* ── 8. Samskara rail: buttons, drag-to-scroll ──────────────────── */
  const rail = $('#rail');
  if (rail) {
    const prev = $('#railPrev');
    const next = $('#railNext');
    const step = () => (rail.firstElementChild?.offsetWidth ?? 280) + 18;

    const syncArrows = () => {
      if (!prev || !next) return;
      const max = rail.scrollWidth - rail.clientWidth - 2;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max;
    };

    prev?.addEventListener('click', () => rail.scrollBy({ left: -step(), behavior: 'smooth' }));
    next?.addEventListener('click', () => rail.scrollBy({ left:  step(), behavior: 'smooth' }));
    rail.addEventListener('scroll', syncArrows, { passive: true });
    window.addEventListener('resize', syncArrows);
    syncArrows();

    // Pointer drag (desktop). Touch keeps native momentum scrolling.
    let dragging = false, startX = 0, startLeft = 0;

    rail.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      dragging = true;
      startX = e.clientX;
      startLeft = rail.scrollLeft;
      rail.setPointerCapture(e.pointerId);
    });
    rail.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) rail.classList.add('is-dragging');
      rail.scrollLeft = startLeft - dx;
    });
    const endDrag = () => {
      dragging = false;
      rail.classList.remove('is-dragging');
    };
    rail.addEventListener('pointerup', endDrag);
    rail.addEventListener('pointercancel', endDrag);
    rail.addEventListener('pointerleave', endDrag);
  }

  /* ── 9. FAQ accordion ───────────────────────────────────────────── */
  $$('.faq-item').forEach(item => {
    const q = $('.faq-q', item);
    q?.addEventListener('click', () => {
      const open = item.classList.toggle('is-open');
      q.setAttribute('aria-expanded', String(open));
    });
  });

  /* ── 10. Forms (demo handlers — wire to a real endpoint later) ──── */
  const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

  const subForm = $('#subForm');
  subForm?.addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#subEmail', subForm);
    const note  = $('#subNote');
    if (!note || !input) return;

    if (!validEmail(input.value)) {
      note.textContent = 'That email does not look right — mind checking it?';
      note.classList.remove('is-ok');
      input.focus();
      return;
    }
    note.textContent = `Welcome to the parivar. We'll write to ${input.value.trim()} this Sunday.`;
    note.classList.add('is-ok');
    subForm.reset();
  });

  const contactForm = $('#contactForm');
  contactForm?.addEventListener('submit', e => {
    e.preventDefault();
    const note = $('#contactNote');
    const email = $('#cEmail', contactForm);
    const name  = $('#cName', contactForm);
    if (!note) return;

    if (!name?.value.trim()) {
      note.textContent = 'Please tell us your name.';
      note.style.color = 'var(--kumkum)';
      name?.focus();
      return;
    }
    if (!validEmail(email?.value ?? '')) {
      note.textContent = 'Please enter a valid email so we can reply.';
      note.style.color = 'var(--kumkum)';
      email?.focus();
      return;
    }
    note.textContent = `Thank you, ${name.value.trim().split(' ')[0]}. We reply within one working day.`;
    note.style.color = 'var(--tulsi)';
    contactForm.reset();
  });

  /* ── 11. Footer year ────────────────────────────────────────────── */
  const yr = $('#yr');
  if (yr) yr.textContent = String(new Date().getFullYear());

  /* ── 12. Mark the current page in the nav ───────────────────────── */
  const here = location.pathname.split('/').pop() || 'index.html';
  $$('.nav__link').forEach(link => {
    const href = link.getAttribute('href') ?? '';
    if (href === here && !href.startsWith('#')) link.setAttribute('aria-current', 'page');
  });
})();
