// backend/controllers/shipments/files.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';

const httpError = (res, code, message) =>
  res.status(code).json({ success: false, message });

export const uploadShipmentFiles = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const s = await Shipment.findById(id).select('_id attachments');
  if (!s) return httpError(res, 404, 'Shipment not found.');

  const files = req.files || {};
  const stamp = new Date();
  const by = req.user?._id;

  const updates = {};
  const logs = [];

  const setAttachment = (field) => {
    const f = Array.isArray(files[field]) ? files[field][0] : undefined;
    if (!f) return false;

    const obj = {
      path: f.path || f.location || f.filename,
      filename: f.filename || f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      uploadedAt: stamp,
      by,
    };

    updates[`attachments.${field}`] = obj;
    logs.push({ type: 'INFO', message: `Uploaded ${field}`, at: stamp, by });
    return true;
  };

  const changed = [
    setAttachment('beforePhoto'),
    setAttachment('afterPhoto'),
    setAttachment('receipt'),
  ].some(Boolean);

  if (!changed) {
    return httpError(res, 400, 'No files uploaded. Expect fields: beforePhoto, afterPhoto, receipt.');
  }

  // 🔒 Atomic update: only touch attachments and logs; skip full validation
  await Shipment.updateOne(
    { _id: s._id },
    {
      $set: updates,
      $push: { logs: { $each: logs } },
    },
    { runValidators: false }
  );

  const updated = await Shipment.findById(s._id).select('attachments').lean();
  return res.json({ success: true, data: updated.attachments });
});
