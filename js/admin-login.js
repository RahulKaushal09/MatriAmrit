/* =====================================================================
   MatriAmrit - admin sign-in

   One job: exchange a username and password for a session token, then
   hand over to the panel. Validation here is a courtesy; the server
   decides, and its message is what the operator sees.
   ===================================================================== */
(() => {
  'use strict';

  const admin = window.MATRIAMRIT_ADMIN;
  const $ = id => document.getElementById(id);

  const form = $('loginForm');
  if (!form) return;

  const statusBox = $('loginStatus');
  const submitBtn = $('loginBtn');
  let submitting = false;

  function showStatus(kind, message) {
    statusBox.className = `form-status is-shown form-status--${kind}`;
    statusBox.textContent = message;
  }

  function clearErrors() {
    statusBox.className = 'form-status';
    statusBox.textContent = '';
    form.querySelectorAll('[data-err]').forEach(el => { el.textContent = ''; });
    form.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
  }

  function showFieldError(field, message) {
    const slot = form.querySelector(`[data-err="${field}"]`);
    if (slot) slot.textContent = message;
    const input = $(field);
    if (input) input.setAttribute('aria-invalid', 'true');
    return input;
  }

  /* Already signed in? Go straight through. */
  if (admin.getToken()) {
    window.location.replace(admin.PANEL_PAGE);
    return;
  }

  /* Arriving from a 401 elsewhere in the panel. */
  if (new URLSearchParams(window.location.search).get('expired')) {
    showStatus('info', 'Your session ended. Please sign in again.');
  }

  /* Show/hide the password. Focus is restored so the toggle does not
     cost a keyboard user their place in the field. */
  $('peekBtn').addEventListener('click', () => {
    const input = $('password');
    const nowVisible = input.type === 'password';
    input.type = nowVisible ? 'text' : 'password';
    $('peekBtn').setAttribute('aria-pressed', String(nowVisible));
    $('peekBtn').setAttribute('aria-label', nowVisible ? 'Hide password' : 'Show password');
    input.focus();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;

    clearErrors();

    const username = $('username').value.trim().toLowerCase();
    const password = $('password').value;

    if (!username) {
      showFieldError('username', 'Enter your username').focus();
      return;
    }
    if (!password) {
      showFieldError('password', 'Enter your password').focus();
      return;
    }

    submitting = true;
    submitBtn.classList.add('is-busy');
    submitBtn.disabled = true;

    try {
      /* noRedirect: a wrong password here is a message on this form, not
         a bounce back to the page we are already on. */
      const data = await admin.post('/admin/login', { username, password }, { noRedirect: true });
      admin.saveSession(data.token, data.expiresAt);

      /* replace, not assign: Back must not return to a sign-in form that
         would silently forward here again. */
      window.location.replace(admin.PANEL_PAGE);
    } catch (err) {
      submitting = false;
      submitBtn.classList.remove('is-busy');
      submitBtn.disabled = false;

      if (Array.isArray(err.details)) {
        err.details.forEach(detail => showFieldError(detail.field, detail.message));
      }

      showStatus('error', err.message || 'We could not sign you in. Please try again.');
      $('password').value = '';
      $('password').focus();
    }
  });
})();
