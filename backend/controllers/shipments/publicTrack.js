// backend/controllers/shipments/publicTrack.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';

const maskAddress = (addr) => (!addr ? null : ({ city: addr.city, province: addr.province }));

export const publicTrack = asyncHandler(async (req, res) => {
  const trackingId = String(req.params.trackingId || '').trim().toUpperCase();
  if (!trackingId) {
    return res.status(400).json({ success: false, message: 'trackingId is required' });
  }

  const s = await Shipment.findOne({ trackingId }).lean();
  if (!s) return res.status(404).json({ success: false, message: 'Tracking ID not found' });

  const milestones = (s.logs || [])
    .filter((l) => l && (l.type === 'STATUS' || l.type === 'LOCATION'))
    .map((l) => ({ type: l.type, message: l.message, at: l.at }));

  return res.json({
    success: true,
    data: {
      trackingId: s.trackingId,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lastLocation: s.lastLocation || null,     // { lat, lng, addressText?, at }
      from: maskAddress(s.pickupAddress),       // { city, province }
      to: maskAddress(s.deliveryAddress),       // { city, province }
      milestones,
    },
  });
});
