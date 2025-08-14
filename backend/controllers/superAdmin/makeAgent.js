// backend/controllers/superAdmin/makeAgent.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import { ROLES, AGENT_TYPES } from '../../models/roles.js';

const httpError = (res, code, message) =>
  res.status(code).json({ success: false, message });

/**
 * Promote a user to AGENT with a specific agentType (PICKUP or DELIVERY).
 * Route (planned): POST /api/super-admin/users/:id/make-agent
 * Body: { agentType: 'PICKUP' | 'DELIVERY' }
 * Auth: protect + requireSuperAdmin
 */
export const makeAgent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { agentType } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return httpError(res, 400, 'Invalid user id');
  }

  if (!Object.values(AGENT_TYPES).includes(agentType)) {
    return httpError(
      res,
      400,
      `agentType must be one of: ${Object.values(AGENT_TYPES).join(', ')}`
    );
  }

  const target = await User.findById(id);
  if (!target) {
    return httpError(res, 404, 'User not found');
  }

  target.role = ROLES.AGENT;
  target.agentType = agentType;
  await target.save();

  return res.json({
    success: true,
    message: `User promoted to AGENT (${agentType})`,
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
