// backend/controllers/shipments/getById.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { isObjectId, httpError } from './_shared.js';

export const getShipmentByIdForUser = asyncHandler(async (req, res) => {
  const raw = String(req.params.id || '').trim();
  const query = isObjectId(raw) ? { _id: raw } : { trackingId: raw.toUpperCase() };

  const shipment = await Shipment.findOne(query);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const userId = req.user?._id ? String(req.user._id) : null;
  const isOwner = userId && shipment.sender && String(shipment.sender) === userId;

  const role = String(req.user?.role || 'USER').toUpperCase();
  const elevated = role === 'ADMIN' || role === 'AGENT' || role === 'DRIVER';

  if (!isOwner && !elevated) {
    return httpError(res, 403, 'Forbidden');
  }

  return res.json({ success: true, data: shipment });
});
