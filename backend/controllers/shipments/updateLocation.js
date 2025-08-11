// backend/controllers/shipments/updateLocation.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Shipment from '../../models/shipment.js';
import { httpError } from './_shared.js';

/**
 * PATCH /api/shipments/:id/location
 * Body: { lat: number, lng: number, addressText?: string }
 * Roles: Agent/Admin (route should use isAgent)
 */
export const updateShipmentLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lat, lng, addressText } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return httpError(res, 400, 'Invalid shipment id.');
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    return httpError(res, 400, 'lat must be between -90 and 90');
  }
  if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
    return httpError(res, 400, 'lng must be between -180 and 180');
  }

  const s = await Shipment.findById(id).select('_id');
  if (!s) return httpError(res, 404, 'Shipment not found.');

  const now = new Date();
  const point = {
    lat: latNum,
    lng: lngNum,
    addressText: addressText && String(addressText).trim() ? String(addressText).trim() : undefined,
    at: now,
    by: req.user?._id,
  };

  // Atomic update to avoid full validation on legacy docs
  await Shipment.updateOne(
    { _id: s._id },
    {
      $set: { lastLocation: point },
      $push: {
        locationHistory: point,
        logs: {
          type: 'LOCATION',
          message: `Location update ${latNum},${lngNum}${point.addressText ? ` — ${point.addressText}` : ''}`,
          at: now,
          by: req.user?._id,
        },
      },
    },
    { runValidators: false }
  );

  return res.json({ success: true, data: { lastLocation: point } });
});
