/* =====================================================================
   Reverse geocoding for the Leaflet pin.

   Proxied through the server rather than called from the browser for two
   reasons: Nominatim's usage policy requires an identifying User-Agent,
   which a browser cannot set, and proxying keeps the customer's
   coordinates from being sent to a third party with their referrer
   attached.

   A failure here is never fatal - the customer's typed address is the
   authoritative one, and the pin is only ever a delivery aid.
   ===================================================================== */
'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');

const TIMEOUT_MS = 5000;

async function reverseGeocode({ lat, lng }) {
  const url = new URL('/reverse', env.NOMINATIM_BASE_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'in');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': env.NOMINATIM_USER_AGENT,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      logger.warn('Nominatim responded with an error', { status: response.status });
      return { available: false };
    }

    const data = await response.json();
    const a = data.address || {};

    return {
      available: true,
      label: data.display_name || null,
      city: a.city || a.town || a.village || a.suburb || a.county || null,
      state: a.state || null,
      pincode: a.postcode || null,
    };
  } catch (err) {
    logger.warn('Reverse geocode failed', { reason: err.name === 'AbortError' ? 'timeout' : err.message });
    return { available: false };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { reverseGeocode };
