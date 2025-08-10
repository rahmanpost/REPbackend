// backend/controllers/shipments/uploadFiles.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { httpError } from './_shared.js';

export const uploadShipmentFiles = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const role = String(req.user?.role || 'USER').toUpperCase();
  if (role !== 'AGENT' && role !== 'ADMIN') {
    return httpError(res, 403, 'Forbidden');
  }

  const files = req.files || {};
  const pick = (name) =>
    Array.isArray(files[name]) && files[name][0]
      ? {
          field: name,
          originalName: files[name][0].originalname,
          fileName: files[name][0].filename,
          mimeType: files[name][0].mimetype,
          size: files[name][0].size,
          path: files[name][0].path || files[name][0].location || undefined,
          uploadedAt: new Date(),
          uploadedBy: req.user?._id || null,
        }
      : null;

  const payload = {
    beforePhoto: pick('beforePhoto'),
    afterPhoto: pick('afterPhoto'),
    receipt: pick('receipt'),
  };

  for (const k of Object.keys(payload)) {
    if (!payload[k]) delete payload[k];
  }
  if (Object.keys(payload).length === 0) {
    return httpError(res, 400, 'No files uploaded.');
  }

  const snapshot = shipment.toObject({ virtuals: false, getters: false });
  let targetKey = null;
  for (const candidate of ['files', 'attachments', 'documents']) {
    if (Object.prototype.hasOwnProperty.call(snapshot, candidate)) {
      targetKey = candidate;
      break;
    }
  }
  if (!targetKey) targetKey = 'attachments';

  const existing = shipment[targetKey] || {};
  shipment[targetKey] = { ...existing, ...payload };

  await shipment.save();
  res.json({ success: true, data: { [targetKey]: shipment[targetKey] } });
});
