// backend/controllers/shipments/updateStatus.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { httpError } from './_shared.js';

export const updateShipmentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body || {};

  const role = String(req.user?.role || 'USER').toUpperCase();
  if (role !== 'AGENT' && role !== 'ADMIN') {
    return httpError(res, 403, 'Forbidden');
  }

  if (!status) return httpError(res, 400, 'status is required.');

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  shipment.status = String(status).toUpperCase();
  if (notes != null) shipment.notes = String(notes);

  await shipment.save();
  res.json({ success: true, data: shipment });
});
