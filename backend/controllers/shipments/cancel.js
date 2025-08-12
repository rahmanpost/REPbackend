// backend/controllers/shipments/cancel.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { isObjectId, httpError } from './_shared.js';

const TERMINAL = new Set(['DELIVERED', 'CANCELLED']);

export const cancelShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  if (!isObjectId(id)) return httpError(res, 400, 'Invalid shipment id.');

  // Minimal fields we need for checks
  const s = await Shipment.findById(id).select('_id sender status');
  if (!s) return httpError(res, 404, 'Shipment not found.');

  // Permissions: owner or admin
  const userId = req.user?._id ? String(req.user._id) : null;
  const isOwner = userId && s.sender && String(s.sender) === userId;
  const isAdmin = String(req.user?.role || '').toUpperCase() === 'ADMIN';
  if (!isOwner && !isAdmin) return httpError(res, 403, 'Forbidden');

  // If delivered, do not allow cancellation
  if (s.status === 'DELIVERED') {
    return httpError(res, 409, 'Delivered shipments cannot be cancelled.');
  }

  // Idempotent: already cancelled -> just return current state
  if (s.status === 'CANCELLED') {
    return res.json({ success: true, data: { status: 'CANCELLED' } });
  }

  const now = new Date();
  const cancelObj = {
    reason: reason ? String(reason) : 'Cancelled',
    at: now,
    by: req.user?._id,
  };

  // Atomic update with log append
  await Shipment.updateOne(
    { _id: s._id },
    {
      $set: {
        status: 'CANCELLED',
        needsReprice: false, // stop any pending reprices
        cancellation: cancelObj,
        // helpful invoice bump for downstream streaming
        invoiceVersion: { $sum: [{ $ifNull: ['$invoiceVersion', 0] }, 1] },
        invoiceRegeneratedAt: now,
      },
      $push: {
        logs: {
          type: 'STATUS',
          message: `Status ${s.status} -> CANCELLED${reason ? ` (${reason})` : ''}`,
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

export default cancelShipment;
