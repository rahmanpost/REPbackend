// backend/routes/superAdminRoutes.js
import express from 'express';
import { protect, requireRoles } from '../middleware/authMiddleware.js';
import { makeAdmin } from '../controllers/superAdmin/makeAdmin.js';
import { makeAgent } from '../controllers/superAdmin/makeAgent.js';
import { revokeRole } from '../controllers/superAdmin/revokeRole.js';

// IMPORTANT:
// Your auth middleware lower-cases roles, and your DB now stores roles like "SUPER_ADMIN".
// That means req.user.role becomes "super_admin" inside the guard.
// So we gate with requireRoles('super_admin').
const router = express.Router();

// All routes below require an authenticated SUPER_ADMIN
router.use(protect, requireRoles('super_admin'));

// Promote a user to ADMIN
// POST /api/super-admin/users/:id/make-admin
router.post('/users/:id/make-admin', makeAdmin);

// Promote a user to AGENT (body: { agentType: "PICKUP" | "DELIVERY" })
// POST /api/super-admin/users/:id/make-agent
router.post('/users/:id/make-agent', makeAgent);

// Revoke any role back to CUSTOMER
// DELETE /api/super-admin/users/:id/roles
router.delete('/users/:id/roles', revokeRole);

export default router;
