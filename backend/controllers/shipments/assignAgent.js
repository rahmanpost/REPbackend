// backend/controllers/shipments/assignAgent.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Shipment from '../../models/shipment.js';
import User from '../../models/User.js';

const httpError = (res, code, message) =>
  res.status(code).json({ success: false, message });

const TERMINAL_STATUSES = new Set(['DELIVERED', 'RETURNED', 'CANCELLED']);

/**
 * PATCH /api/shipments/:id/assign-agent
 * Body: { agentId: string }
 * Roles: ADMIN or AGENT (coordinator). Regular customers cannot assign.
 */
export const assignAgent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { agentId } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return httpError(res, 400, 'Invalid shipment id.');
  }
  if (!agentId || !mongoose.Types.ObjectId.isValid(agentId)) {
    return httpError(res, 400, 'agentId is required and must be a valid id.');
  }

  // Only Admins/Agents can assign
  const role = String(req.user?.role || '').toUpperCase();
  const elevated = role === 'ADMIN' || role === 'AGENT';
  if (!elevated) return httpError(res, 403, 'Forbidden');

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const status = String(shipment.status || '').toUpperCase();
  if (TERMINAL_STATUSES.has(status)) {
    return httpError(res, 409, `Cannot assign agent to a ${status.toLowerCase()} shipment.`);
  }

  // Verify target is a User with role AGENT
  const agentUser = await User.findOne({ _id: agentId, role: 'agent' });
  if (!agentUser) return httpError(res, 404, 'Agent user not found or not an AGENT.');

  shipment.agent = agentUser._id;
  await shipment.save();

  const populated = await Shipment.findById(shipment._id)
    .populate('sender', 'fullName email')
    .populate('agent', 'fullName email');

  res.json({ success: true, data: populated });
});
