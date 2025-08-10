// backend/controllers/shipments/previewReprice.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import Pricing from '../../models/pricing.js';
import { computeTotals } from '../../utils/pricing/calc.js';
import { httpError } from './_shared.js';

export const previewRepriceShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const role = String(req.user?.role || '').toUpperCase();
  if (role !== 'ADMIN' && role !== 'AGENT') {
    return httpError(res, 403, 'Forbidden');
  }

  const shipment = await Shipment.findById(id).lean();
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const version = req.query.version ? String(req.query.version) : null;
  let pricing;
  if (version) {
    pricing = await Pricing.findOne({ version }).lean();
    if (!pricing) return httpError(res, 404, `Pricing version "${version}" not found.`);
  } else {
    pricing = await Pricing.findOne({ active: true }).lean();
    if (!pricing) return httpError(res, 404, 'No active pricing found.');
  }

  const input = {
    weightKg: shipment.weightKg ?? 0,
    pieces: shipment.pieces ?? 1,
    serviceType: shipment.serviceType || 'EXPRESS',
    isCOD: !!shipment.isCOD,
    codAmount: shipment.codAmount ?? 0,
    zoneName: shipment.zoneName,
    dimensionsCm: shipment.dimensionsCm || {},
  };

  const quote = computeTotals(input, pricing);
  const baseAfterMin = Math.max(
    (quote.breakdown.baseFromWeight || 0) + (quote.breakdown.baseFromPieces || 0),
    quote.breakdown.minChargeApplied || 0
  );

  return res.json({
    success: true,
    data: {
      shipmentId: shipment._id,
      pricingVersion: pricing.version,
      currency: quote.currency,
      baseCharge: baseAfterMin,
      serviceCharge: quote.breakdown.serviceAmount || 0,
      fuelSurcharge: quote.breakdown.fuelSurcharge || 0,
      otherFees: Math.round(((quote.breakdown.otherFixedFees || 0) + (quote.breakdown.codFee || 0)) * 100) / 100,
      total: quote.total,
      breakdown: quote.breakdown,
    },
  });
});
