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

/**
 * Verify JWT and return payload or null.
 */
function verifyJwt(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Attach req.user if token is valid (does not error if missing/invalid).
 * Useful for public endpoints that behave differently when signed in.
 */
export const attachUserIfPresent = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  const decoded = verifyJwt(token);
  if (!decoded?.id) return next();

  // Pull minimal fields; add more if you commonly need them
  const user = await User.findById(decoded.id).select('_id name email role');
  if (user) req.user = user;

  next();
});

/**
 * Require a valid token. Sets req.user.
 */
export const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized: token missing' });
  }

  const decoded = verifyJwt(token);
  if (!decoded?.id) {
    return res.status(401).json({ success: false, message: 'Not authorized: token invalid or expired' });
  }

  const user = await User.findById(decoded.id).select('_id name email role');
  if (!user) {
    return res.status(401).json({ success: false, message: 'Not authorized: user not found' });
  }

  req.user = user;
  next();
});

/**
 * Role guards
 */
export const isAdmin = (req, res, next) => {
  if (req.user?.role === 'ADMIN') return next();
  return res.status(403).json({ success: false, message: 'Forbidden: admin only' });
};

export const isAgent = (req, res, next) => {
  const role = req.user?.role;
  if (role === 'AGENT' || role === 'ADMIN') return next();
  return res.status(403).json({ success: false, message: 'Forbidden: agent only' });
};

/**
 * Flexible role guard.
 * Usage: router.post('/x', protect, requireRoles('ADMIN','AGENT'), handler)
 */
export const requireRoles = (...roles) => (req, res, next) => {
  const role = req.user?.role;
  if (role && roles.includes(role)) return next();
  return res.status(403).json({ success: false, message: `Forbidden: requires ${roles.join(' or ')}` });
};
