// backend/controllers/shipments/cancel.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { httpError, TERMINAL_STATUSES } from './_shared.js';

export const cancelShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const role = String(req.user?.role || 'USER').toUpperCase();
  const elevated = role === 'ADMIN' || role === 'AGENT';
  const isOwner =
    req.user &&
    shipment.sender &&
    String(shipment.sender) === String(req.user._id);

  if (!isOwner && !elevated) return httpError(res, 403, 'Forbidden');

  const current = String(shipment.status || '').toUpperCase();
  if (TERMINAL_STATUSES.has(current)) {
    if (current === 'CANCELLED') {
      return httpError(res, 409, 'Shipment is already cancelled.');
    }
    return httpError(res, 409, `Cannot cancel a ${current.toLowerCase()} shipment.`);
  }

  shipment.status = 'CANCELLED';
  shipment.cancellation = {
    reason: reason ? String(reason) : 'Cancelled by request',
    at: new Date(),
    by: req.user?._id || null,
  };

  await shipment.save();
  res.json({ success: true, data: shipment });
});
