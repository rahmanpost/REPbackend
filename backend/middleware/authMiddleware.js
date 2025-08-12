// backend/middleware/authMiddleware.js
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Extract JWT token from:
 * - Authorization: Bearer <token>
 * - Cookie: jwt=... (or token=...)
 */
function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();

  // If you're using cookie-parser, this will work:
  const cookieToken = req.cookies?.jwt || req.cookies?.token;
  if (cookieToken) return cookieToken;

  return null;
}

/** Verify JWT and return payload or null. */
function verifyJwt(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Attach req.user if token is present & valid (no error if missing/invalid).
 * Useful for public endpoints that behave differently when signed in.
 */
export const attachUserIfPresent = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  const decoded = verifyJwt(token);
  if (!decoded?.id) return next();

  const user = await User.findById(decoded.id).select('_id fullName email role emailVerified');
  if (user) req.user = user;

  next();
});

/** Require a valid token. Sets req.user from DB. */
export const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized: token missing' });
  }

  const decoded = verifyJwt(token);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Not authorized: token invalid or expired' });
  }

  const user = await User.findById(decoded.id).select('_id fullName email role emailVerified');
  if (!user) {
    return res.status(401).json({ success: false, message: 'Not authorized: user not found' });
  }

  req.user = user; // trust DB role (handles promotions without reissuing JWT)
  next();
});

/** Flexible role guard. Usage: requireRoles('admin','agent') */
export const requireRoles = (...roles) => {
  const allow = (Array.isArray(roles[0]) ? roles[0] : roles).map((r) => String(r).toLowerCase());
  const allowSet = new Set(allow);
  return (req, res, next) => {
    const role = String(req.user?.role || '').toLowerCase();
    if (allowSet.has(role)) return next();
    return res.status(403).json({ success: false, message: `Forbidden: requires ${[...allowSet].join(' or ')}` });
  };
};

/** Convenience gates */
export const requireAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Forbidden: admin only' });
};

export const requireAgent = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'agent' || role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Forbidden: agent only' });
};

// Legacy aliases so older routes don't break
export const isAdmin = requireAdmin;
export const isAgent = requireAgent;
