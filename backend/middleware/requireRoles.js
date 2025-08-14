// backend/middleware/requireRoles.js
import { ROLES } from '../models/roles.js';

/**
 * Ensure the user is authenticated (req.user set by your protect middleware)
 * and has one of the allowed roles.
 *
 * Usage:
 *   router.use(protect, requireRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN))
 */
export const requireRoles = (...allowed) => {
  const allowedSet = new Set(allowed);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!allowedSet.has(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  };
};

/**
 * Convenience guard for SUPER_ADMIN-only endpoints.
 *
 * Usage:
 *   router.use(protect, requireSuperAdmin)
 */
export const requireSuperAdmin = requireRoles(ROLES.SUPER_ADMIN);
