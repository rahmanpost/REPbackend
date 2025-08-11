import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Shipment from '../../models/shipment.js';
import User from '../../models/User.js';

const httpError = (res, code, message) =>
  res.status(code).json({ success: false, message });

const TERMINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED']); // upgraded lifecycle

/**
 * PATCH /api/shipments/:id/assign-agent
 * Body: { stage: 'PICKUP' | 'DELIVERY', agentId: string }
 * Roles: ADMIN or AGENT (coordinator). Customers cannot assign.
 */
export const assignAgent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let { stage, agentId } = req.body || {};

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

  // Normalize/validate stage
  stage = String(stage || 'PICKUP').trim().toUpperCase();
  if (stage !== 'PICKUP' && stage !== 'DELIVERY') {
    return httpError(res, 400, 'stage must be PICKUP or DELIVERY.');
  }

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const status = String(shipment.status || '').toUpperCase();
  if (TERMINAL_STATUSES.has(status)) {
    return httpError(res, 409, `Cannot assign agent to a ${status.toLowerCase()} shipment.`);
  }

  // Verify target is a User with role AGENT (accept both 'agent' and 'AGENT')
  const agentUser = await User.findOne({ _id: agentId, role: { $in: ['agent', 'AGENT'] } });
  if (!agentUser) return httpError(res, 404, 'Agent user not found or not an AGENT.');

  const now = new Date();
  const setField =
    stage === 'PICKUP'
      ? { pickupAgent: agentUser._id }
      : { deliveryAgent: agentUser._id };

  // 🔒 Atomic update — skip full validation to avoid legacy required-field issues
  await Shipment.updateOne(
    { _id: shipment._id },
    {
      $set: setField,
      $push: {
        logs: {
          type: 'INFO',
          message: `Assigned ${stage.toLowerCase()} agent: ${agentUser._id}`,
          at: now,
          by: req.user?._id,
        },
      },
    },
    { runValidators: false }
  );

  // Return a populated snapshot
  const populated = await Shipment.findById(shipment._id)
    .populate('sender', 'fullName email')
    .populate('pickupAgent', 'fullName email')
    .populate('deliveryAgent', 'fullName email');

  return res.json({ success: true, data: populated });
});
