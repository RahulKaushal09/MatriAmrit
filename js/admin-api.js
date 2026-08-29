/* =====================================================================
   MatriAmrit - admin API client

   Shared by the login page and the panel. Holds the session token,
   attaches it to every request, and sends the operator back to the
   login page the moment the server stops accepting it.

   The token lives in sessionStorage, not localStorage: closing the tab
   ends the session, which is the right default for a panel that shows
   customer phone numbers and addresses.
   ===================================================================== */
(() => {
  'use strict';

  const cfg = window.MATRIAMRIT;

  const TOKEN_KEY = 'matriamrit.admin.token.v1';
  const EXPIRY_KEY = 'matriamrit.admin.expires.v1';
  const LOGIN_PAGE = 'admin-login.html';
  const PANEL_PAGE = 'admin.html';

  /* ── Session store ──────────────────────────────────────────────── */

  function saveSession(token, expiresAt) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(EXPIRY_KEY, String(new Date(expiresAt).getTime()));
    } catch { /* storage disabled - the session lasts this page only */ }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(EXPIRY_KEY);
    } catch { /* ignore */ }
  }

  /* Returns the token only while it is still inside its stated life. The
     server checks the real expiry; this just avoids a pointless round
     trip and a flash of the panel before the redirect. */
  function getToken() {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (!token) return null;

      const expiresAt = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
      if (expiresAt && Date.now() >= expiresAt) {
        clearSession();
        return null;
      }
      return token;
    } catch {
      return null;
    }
  }

  /* ── Requests ───────────────────────────────────────────────────── */

  /**
   * Calls the admin API with the session token attached.
   *
   * A 401 means the session is over however it happened - expired,
   * revoked, secret rotated - so it clears the token and bounces to the
   * login page rather than leaving a dead panel on screen.
   */
  async function request(path, options = {}) {
    const token = getToken();

    const response = await fetch(cfg.apiBase + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    let payload = null;
    try { payload = await response.json(); } catch { /* non-JSON error page */ }

    if (response.status === 401 && !options.noRedirect) {
      clearSession();
      window.location.replace(`${LOGIN_PAGE}?expired=1`);
      /* Never resolves - the page is on its way out. */
      return new Promise(() => {});
    }

    if (!response.ok || !payload || payload.success === false) {
      const error = new Error(payload?.error?.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.code = payload?.error?.code || null;
      error.details = payload?.error?.details || null;
      throw error;
    }

    return payload.data;
  }

  const get = (path, options) => request(path, { ...options, method: 'GET' });

  const post = (path, body, options) =>
    request(path, { ...options, method: 'POST', body: JSON.stringify(body || {}) });

  const patch = (path, body, options) =>
    request(path, { ...options, method: 'PATCH', body: JSON.stringify(body || {}) });

  /* ── Formatting shared by both admin pages ──────────────────────── */

  const money = paise => {
    const rupees = paise / 100;
    const hasPaise = paise % 100 !== 0;
    return `₹${rupees.toLocaleString('en-IN', {
      minimumFractionDigits: hasPaise ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  };

  /** "29 Aug, 1:42 pm" - what an operator actually needs to read. */
  const dateTime = value => {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
    });
  };

  /** "2 hours ago" for anything recent, a date once it is not. */
  const relative = value => {
    if (!value) return '—';
    const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return dateTime(value);
  };

  /** "+91 98765 43210" from the bare ten digits we store. */
  const phone = digits => {
    const bare = String(digits || '').replace(/\D/g, '').slice(-10);
    return bare.length === 10 ? `+91 ${bare.slice(0, 5)} ${bare.slice(5)}` : (digits || '—');
  };

  window.MATRIAMRIT_ADMIN = {
    LOGIN_PAGE,
    PANEL_PAGE,
    saveSession,
    clearSession,
    getToken,
    request,
    get,
    post,
    patch,
    fmt: { money, dateTime, relative, phone },
  };
})();
