// backend/controllers/shipments/assignAgent.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import User from '../../models/User.js';
import { isObjectId, httpError } from './_shared.js';

const TERMINAL = new Set(['DELIVERED', 'CANCELLED']);

function normStage(s) {
  const v = String(s || '').toUpperCase().trim();
  if (v === 'PICKUP' || v === 'DELIVERY') return v;
  return null;
}

/**
 * PATCH /api/shipments/:id/assign-agent
 * Body: { stage: 'PICKUP' | 'DELIVERY', agentId: string, replace?: boolean, bumpInvoice?: boolean }
 * Roles: admin/agent via route guards (customers should not hit this).
 */
export const assignAgent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let { stage, agentId, replace = false, bumpInvoice = false } = req.body || {};

  // Basic validations
  if (!isObjectId(id)) return httpError(res, 400, 'Invalid shipment id.');
  stage = normStage(stage);
  if (!stage) return httpError(res, 400, 'stage must be PICKUP or DELIVERY.');
  if (!isObjectId(agentId)) return httpError(res, 400, 'Invalid agentId.');

  // Load shipment
  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  // Block on terminal statuses
  if (TERMINAL.has(shipment.status)) {
    return httpError(res, 409, `Cannot assign agent on terminal shipment (${shipment.status}).`);
  }

  // Verify agent exists and has agent role (stored lowercase in DB)
  const agent = await User.findById(agentId).select('_id fullName role').lean();
  if (!agent) return httpError(res, 404, 'Agent user not found.');

  const role = String(agent.role || '').toLowerCase();
  if (role !== 'agent') {
    return httpError(res, 400, 'Selected user is not an agent.');
  }

  // Determine field to set
  const field = stage === 'PICKUP' ? 'pickupAgent' : 'deliveryAgent';
  const prev = shipment[field]?.toString?.() || null;
  const next = agentId.toString();

  // If same agent already assigned and not replacing, conflict
  if (prev && prev === next && !replace) {
    return httpError(res, 409, `This ${stage.toLowerCase()} agent is already assigned.`);
  }

  // If different agent already assigned and replace not requested, block
  if (prev && prev !== next && !replace) {
    return httpError(
      res,
      409,
      `A different ${stage.toLowerCase()} agent is already assigned. Pass replace: true to reassign.`
    );
  }

  // Assign (or reassign)
  shipment[field] = agentId;

  // Optional: bump invoice version if requested (useful if invoice shows assigned agent)
  if (bumpInvoice) {
    shipment.invoiceVersion = (shipment.invoiceVersion || 0) + 1;
    shipment.invoiceRegeneratedAt = new Date();
  }

  // Log action
  shipment.logs = shipment.logs || [];
  shipment.logs.push({
    type: 'ASSIGN',
    message:
      prev && prev !== next
        ? `Reassigned ${stage} agent: ${prev} → ${next}`
        : `Assigned ${stage} agent: ${next}`,
    at: new Date(),
    by: req.user?._id,
  });

  await shipment.save();

  return res.json({ success: true, data: shipment });
});

export default assignAgent;
