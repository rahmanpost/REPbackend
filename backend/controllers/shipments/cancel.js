// backend/controllers/shipments/cancel.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { httpError } from './_shared.js';

export const cancelShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  const s = await Shipment.findById(id).select('_id sender status');
  if (!s) return httpError(res, 404, 'Shipment not found.');

  const userId = req.user?._id ? String(req.user._id) : null;
  const isOwner = userId && s.sender && String(s.sender) === userId;
  const isAdmin = String(req.user?.role || '').toUpperCase() === 'ADMIN';
  if (!isOwner && !isAdmin) return httpError(res, 403, 'Forbidden');

  const curr = String(s.status || '').toUpperCase();
  if (curr === 'DELIVERED' || curr === 'CANCELLED') {
    return httpError(res, 400, `Cannot cancel when status is ${curr}`);
  }

  const now = new Date();
  const cancelObj = {
    reason: reason || 'Cancelled',
    at: now,
    by: req.user?._id,
  };

  // 🔒 Atomic write; skip full validation to support legacy records
  await Shipment.updateOne(
    { _id: s._id },
    {
      $set: {
        status: 'CANCELLED',
        cancellation: cancelObj,
      },
      $push: {
        logs: {
          type: 'STATUS',
          message: `Status changed ${curr} -> CANCELLED${reason ? ` (${reason})` : ''}`,
          at: now,
          by: req.user?._id,
        },
      },
    },
    { runValidators: false }
  );

  return res.json({
    success: true,
    data: { status: 'CANCELLED', cancellation: cancelObj },
  });
});
