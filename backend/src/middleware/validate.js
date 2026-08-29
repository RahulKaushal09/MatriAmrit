/* =====================================================================
   Zod request validation.

   On success the parsed - and therefore coerced, trimmed and stripped -
   value REPLACES the raw input, so a controller can never accidentally
   read an unvalidated field.
   ===================================================================== */
'use strict';

const ApiError = require('../utils/ApiError');

module.exports = function validate(schemas) {
  return (req, _res, next) => {
    for (const source of ['body', 'query', 'params']) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);
      if (!result.success) {
        const details = result.error.issues.map(i => ({
          field: i.path.join('.') || source,
          message: i.message,
        }));
        return next(ApiError.badRequest('Please check the highlighted fields.', { details }));
      }

      if (source === 'query') {
        /* req.query may be getter-only; mutate rather than reassign. */
        for (const key of Object.keys(req.query)) delete req.query[key];
        Object.assign(req.query, result.data);
      } else {
        req[source] = result.data;
      }
    }
    return next();
  };
};
