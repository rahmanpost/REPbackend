// backend/controllers/superAdmin/revokeRole.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import { ROLES } from '../../models/roles.js';

const httpError = (res, code, message) =>
  res.status(code).json({ success: false, message });

/**
 * Revoke any role (ADMIN or AGENT) and set the user back to CUSTOMER.
 * Route (planned): DELETE /api/super-admin/users/:id/roles
 * Auth: protect + requireSuperAdmin
 */
export const revokeRole = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return httpError(res, 400, 'Invalid user id');
  }

  const target = await User.findById(id);
  if (!target) {
    return httpError(res, 404, 'User not found');
  }

  target.role = ROLES.CUSTOMER;
  target.agentType = null;
  await target.save();

  return res.json({
    success: true,
    message: 'User role reset to CUSTOMER',
    user: {
      id: target._id,
      fullName: target.fullName,
      email: target.email,
      phone: target.phone,
      role: target.role,
      agentType: target.agentType,
    },
  });
});
