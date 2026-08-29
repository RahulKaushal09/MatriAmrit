/* =====================================================================
   MatriAmrit - frontend runtime config

   One place to point the site at an API. On localhost it assumes a
   backend on :4000; anywhere else it uses the production host below.
   Change PRODUCTION_API before you deploy.
   ===================================================================== */
(() => {
   'use strict';

   const PRODUCTION_API = 'https://api.matriamrit.com/api/v1';
   const LOCAL_API = 'http://localhost:4000/api/v1';

   const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

   window.MATRIAMRIT = {
      apiBase: isLocal ? LOCAL_API : PRODUCTION_API,

      /* Where the checkout stashes the basket between pages. sessionStorage,
         not localStorage: a basket should not outlive the tab. */
      basketKey: 'matriamrit.basket.v1',

      /* The coupon the customer typed, kept beside the basket so a page
         refresh mid-checkout does not silently drop their discount. What
         it is worth is still decided by the server on every quote. */
      couponKey: 'matriamrit.coupon.v1',

      whatsapp: '917838441441',
      supportEmail: 'matriamrit.gkg@gmail.com',
   };
})();
