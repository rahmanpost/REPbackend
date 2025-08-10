// backend/controllers/shipments/getById.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { isObjectId, httpError } from './_shared.js';

export const getShipmentByIdForUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isId = isObjectId(id);
  const query = isId ? { _id: id } : { trackingId: String(id).toUpperCase() };

  const shipment = await Shipment.findOne(query);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const isOwner =
    req.user &&
    shipment.sender &&
    String(shipment.sender) === String(req.user._id);

  const role = String(req.user?.role || 'USER').toUpperCase();
  const elevated = role === 'ADMIN' || role === 'AGENT';

  if (!isOwner && !elevated) {
    return httpError(res, 403, 'Forbidden');
  }

  res.json({ success: true, data: shipment });
});
