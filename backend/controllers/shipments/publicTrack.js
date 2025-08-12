// backend/controllers/shipments/publicTrack.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';

const maskAddress = (addr) =>
  !addr ? null : ({ city: addr.city, province: addr.province });

export const publicTrack = asyncHandler(async (req, res) => {
  const trackingId = String(req.params.trackingId || '').trim().toUpperCase();
  if (!trackingId) {
    return res.status(400).json({ success: false, message: 'trackingId is required' });
  }

  // Only expose safe fields to the public
  const s = await Shipment.findOne({ trackingId })
    .select(
      'trackingId status createdAt updatedAt lastLocation pickupAddress deliveryAddress ' +
      'boxType weightKg volumetricDivisor volumetricWeightKg chargeableWeightKg ' +
      'pricingVersion'
    )
    .lean();

  if (!s) return res.status(404).json({ success: false, message: 'Tracking ID not found' });

  // Filter logs down to safe public milestones
  const milestones = (s.logs || [])
    .filter((l) => l && l.type && l.at) // basic guard
    .map((l) => ({
      type: l.type,
      message: l.message,
      at: l.at,
    }))
    .slice(-50); // keep it light

  return res.json({
    success: true,
    data: {
      trackingId: s.trackingId,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,

      // last known point (lat, lng, accuracy?, address?, at)
      lastLocation: s.lastLocation || null,

      // origin/destination (masked)
      from: maskAddress(s.pickupAddress),
      to: maskAddress(s.deliveryAddress),

      // light package info
      boxType: s.boxType || null,
      weight: {
        actualKg: s.weightKg ?? null,
        volumetricKg: s.volumetricWeightKg ?? null,
        chargeableKg: s.chargeableWeightKg ?? null,
        volumetricDivisor: s.volumetricDivisor ?? 5000,
      },

      // pricing tag (no amounts exposed publicly)
      pricingVersion: s.pricingVersion || null,

      // public timeline
      milestones,
    },
  });
});

export default publicTrack;
