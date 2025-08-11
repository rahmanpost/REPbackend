// backend/controllers/shipments/reprice.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Shipment from '../../models/shipment.js';
import Pricing from '../../models/pricing.js';
import computeTotals from '../../utils/computeTotals.js';
import { httpError } from './_shared.js';

const loadPricing = async (pricingVersion) => {
  if (pricingVersion) {
    if (!mongoose.Types.ObjectId.isValid(pricingVersion)) {
      throw new Error('Invalid pricingVersion id');
    }
    const p = await Pricing.findById(pricingVersion);
    if (!p) throw new Error('pricingVersion not found');
    return p;
  }
  // prefer active + not archived; fall back to any active
  let p = await Pricing.findOne({ active: true, archived: { $ne: true } }).sort({ updatedAt: -1 });
  if (!p) p = await Pricing.findOne({ active: true }).sort({ updatedAt: -1 });
  if (!p) throw new Error('No active pricing configured');
  return p;
};

const toShipmentLike = (s, divisor) => ({
  boxType: s.boxType,
  dimensionsCm: s.dimensionsCm, // ok for legacy docs that only have dimensionsCm
  weightKg: s.weightKg ?? 0,
  volumetricDivisor: divisor ?? s.volumetricDivisor ?? 5000,
});

/**
 * GET /api/admin/shipments/:id/reprice/preview?pricingVersion=<id>
 * Roles: Admin (enforced in route/middleware)
 */
export const previewReprice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return httpError(res, 400, 'Invalid shipment id.');

  const s = await Shipment.findById(id);
  if (!s) return httpError(res, 404, 'Shipment not found.');

  try {
    const p = await loadPricing(req.query?.pricingVersion);
    const totals = computeTotals(toShipmentLike(s, p.volumetricDivisor), p.toObject());
    return res.json({
      success: true,
      data: {
        shipmentId: s._id,
        pricingVersion: p._id,
        totals,
      },
    });
  } catch (err) {
    return httpError(res, 400, err.message || 'Failed to preview repricing');
  }
});

/**
 * PATCH /api/admin/shipments/:id/reprice
 * Body: { pricingVersion?: string, otherCharges?: number }
 * Roles: Admin (enforced in route/middleware)
 */
export const repriceShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { pricingVersion, otherCharges } = req.body || {};

  if (!mongoose.Types.ObjectId.isValid(id)) return httpError(res, 400, 'Invalid shipment id.');
  if (otherCharges != null && !(Number.isFinite(Number(otherCharges)) && Number(otherCharges) >= 0)) {
    return httpError(res, 400, 'otherCharges must be a non-negative number');
  }

  const s = await Shipment.findById(id);
  if (!s) return httpError(res, 404, 'Shipment not found.');

  try {
    const p = await loadPricing(pricingVersion);
    const totals = computeTotals(toShipmentLike(s, p.volumetricDivisor), p.toObject());

    // 🔒 Atomic update: set only computed/price fields; skip full validation
    const update = {
      $set: {
        actualCharges: totals.actualCharges,
        tax: totals.tax,
        volumetricDivisor: totals.volumetricDivisor,
        volumetricWeightKg: totals.volumetricWeightKg,
        chargeableWeightKg: totals.chargeableWeightKg,
        pricingVersion: p._id,
        needsReprice: false,
      },
      $push: {
        logs: {
          type: 'INFO',
          message: `Repriced with version=${p._id} (grandTotal=${totals.grandTotal.toFixed(2)})`,
          at: new Date(),
          by: req.user?._id,
          data: totals.breakdown,
        },
      },
    };

    if (otherCharges != null) {
      update.$set.otherCharges = Number(otherCharges);
    }

    await Shipment.updateOne({ _id: s._id }, update, { runValidators: false });

    return res.json({
      success: true,
      data: {
        shipmentId: s._id,
        pricingVersion: p._id,
        totals,
      },
    });
  } catch (err) {
    return httpError(res, 400, err.message || 'Failed to reprice shipment');
  }
});
