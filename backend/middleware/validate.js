// backend/middleware/validate.js
import { ZodError } from 'zod';

/**
 * Safely copy keys from src -> tgt without reassigning req.query/params/body.
 * Returns true if we mutated an object target, false if we should fall back to assignment.
 */
function assignInto(tgt, src) {
  if (!tgt || typeof tgt !== 'object') return false;

  // remove keys not in src
  for (const k of Object.keys(tgt)) {
    if (!(k in src)) delete tgt[k];
  }
  // copy keys from src
  for (const [k, v] of Object.entries(src)) {
    tgt[k] = v;
  }
  return true;
}

/**
 * Validate req[source] (body|query|params) against a Zod schema.
 * Replaces data by MUTATION (safe for Express 5), with fallback to assignment if needed.
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const original = req[source] ?? {};
    const parsed = schema.parse(original);

    // In Express 5, req.query must NOT be reassigned. Mutate instead.
    if (!assignInto(req[source], parsed)) {
      // Fallback for cases where target isn't an object (rare for body/params)
      req[source] = parsed;
    }

    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const errors = err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }
    next(err);
  }
};
