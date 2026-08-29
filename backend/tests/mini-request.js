/* A tiny supertest stand-in - boots the app on an ephemeral port. */
'use strict';

module.exports = function request(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      const parse = async res => {
        const text = await res.text();
        let body; try { body = JSON.parse(text); } catch { body = text; }
        return { status: res.status, body };
      };
      /* `headers` carries the admin panel's Authorization token; the
         storefront calls pass nothing and are unaffected. */
      const send = (method) => async (p, json, headers) => parse(await fetch(base + p, {
        method,
        headers: { 'Content-Type': 'application/json', ...(headers || {}) },
        body: JSON.stringify(json),
      }));

      resolve({
        get: async (p, headers) => parse(await fetch(base + p, { headers: headers || {} })),
        post: send('POST'),
        patch: send('PATCH'),
        postRaw: async (p, raw, headers) => parse(await fetch(base + p, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: raw,
        })),
        close: () => new Promise(r => server.close(r)),
      });
    });
  });
};
