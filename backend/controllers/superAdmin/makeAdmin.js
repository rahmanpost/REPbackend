// backend/controllers/superAdmin/makeAdmin.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import { ROLES } from '../../models/roles.js';

const httpError = (res, code, message) =>
  res.status(code).json({ success: false, message });

/**
 * Promote a user to ADMIN.
 * Route (planned): POST /api/super-admin/users/:id/make-admin
 * Auth: protect + requireSuperAdmin
 */
export const makeAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return httpError(res, 400, 'Invalid user id');
  }

  const target = await User.findById(id);
  if (!target) {
    return httpError(res, 404, 'User not found');
  }

  target.role = ROLES.ADMIN;
  target.agentType = null; // clear any agent subtype
  await target.save();

  return res.json({
    success: true,
    message: 'User promoted to ADMIN',
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
