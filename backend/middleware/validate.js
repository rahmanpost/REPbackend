// backend/middleware/validate.js
import { ZodError } from 'zod';

/** Mutate target (req.body/query/params) in place to match src */
function assignInto(tgt, src) {
  if (!tgt || typeof tgt !== 'object') return false;
  // remove keys not in src
  for (const k of Object.keys(tgt)) if (!(k in src)) delete tgt[k];
  // copy keys from src
  for (const [k, v] of Object.entries(src)) tgt[k] = v;
  return true;
}

export const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const where = ['body', 'query', 'params'].includes(source) ? source : 'body';
    const original = req[where] ?? {};

    if (!schema) return next(); // nothing to validate

    // Use parse (throws on error) — your try/catch handles it
    const parsed = schema.parse(original);

    // Express v5: never reassign req.query/params; mutate instead
    if (!assignInto(req[where], parsed)) {
      // Only falls back for non-object targets (rare), safe for body
      req[where] = parsed;
    }

    // Optional: keep a reference of what we validated
    req.validated = { ...(req.validated || {}), [where]: parsed };

    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: err.issues.map((i) => ({
          path: Array.isArray(i.path) ? i.path.join('.') : String(i.path),
          message: i.message,
          code: i.code,
        })),
      });
    }
    next(err);
  }
};
