// backend/controllers/admin/_shared.js
import asyncHandler from 'express-async-handler';

/** Minimal http error helper (mirrors your style) */
export function httpError(res, code = 400, msg = 'Bad Request') {
  return res.status(code).json({ success: false, error: String(msg) });
}

export const withHandler = (fn) => asyncHandler(fn);

export function isAdminOrSuper(req) {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
}
export function isSuper(req) {
  const r = String(req.user?.role || '').toLowerCase();
  return r === 'super_admin';
}

export function requireAdmin(req, res) {
  if (!isAdminOrSuper(req)) {
    httpError(res, 403, 'Forbidden: admin privileges required.');
    return false;
  }
  return true;
}

/** Escape regex (avoid ReDoS) */
export function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Redact sensitive bank fields unless super admin */
export function redactStaffForRole(obj, req) {
  const staff = obj?.toObject ? obj.toObject() : { ...obj };
  if (!isSuper(req) && staff.bank) {
    const { bankName } = staff.bank || {};
    staff.bank = bankName ? { bankName } : undefined;
  }
  return staff;
}

/** Uniform Zod error reply */
export function zodError(res, e) {
  const details = e?.issues?.map((i) => ({ path: i.path?.join('.') || '', message: i.message })) || [];
  return httpError(res, 422, { message: 'Validation failed', details });
}
