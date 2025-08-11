// backend/controllers/shipments/updateStatus.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { assertTransition } from '../../validators/shipmentSchemas.js';
import { httpError } from './_shared.js';

export const updateShipmentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, reason, notes } = req.body || {};

  const s = await Shipment.findById(id).select('_id status');
  if (!s) return httpError(res, 404, 'Shipment not found.');

  // Enforce lifecycle rule
  try {
    assertTransition(s.status, status);
  } catch (e) {
    return httpError(res, 400, e?.message || 'Invalid status transition');
  }

  // Require a reason for specific statuses
  const needReason = status === 'CANCELLED' || status === 'ON_HOLD' || status === 'RETURN_TO_SENDER';
  if (needReason && !reason) {
    return httpError(res, 400, 'Reason is required for this status.');
  }

  const prev = s.status;
  const now = new Date();

  const update = {
    $set: { status },
    $push: {
      logs: {
        type: 'STATUS',
        message: `Status changed ${prev} -> ${status}${reason ? ` (${reason})` : ''}${notes ? ` — ${notes}` : ''}`,
        at: now,
        by: req.user?._id,
      },
    },
  };

  if (status === 'CANCELLED') {
    update.$set.cancellation = {
      reason: reason || 'Cancelled',
      at: now,
      by: req.user?._id,
    };
  }

  // Atomic write; skip full validation to support legacy records
  await Shipment.updateOne({ _id: s._id }, update, { runValidators: false });

  return res.json({ success: true, data: { status } });
});
