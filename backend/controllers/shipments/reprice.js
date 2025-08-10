// backend/controllers/shipments/reprice.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import Pricing from '../../models/pricing.js';
import { computeTotals } from '../../utils/pricing/calc.js';
import { httpError } from './_shared.js';

export const repriceShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const role = String(req.user?.role || '').toUpperCase();
  if (role !== 'ADMIN' && role !== 'AGENT') {
    return httpError(res, 403, 'Forbidden');
  }

  const shipment = await Shipment.findById(id);
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

  shipment.baseCharge = baseAfterMin;
  shipment.serviceCharge = quote.breakdown.serviceAmount || 0;
  shipment.fuelSurcharge = quote.breakdown.fuelSurcharge || 0;
  shipment.otherFees = Math.round(((quote.breakdown.otherFixedFees || 0) + (quote.breakdown.codFee || 0)) * 100) / 100;
  shipment.currency = quote.currency || 'AFN';
  if (pricing.version) shipment.pricingVersion = pricing.version;

  await shipment.save();

  return res.json({
    success: true,
    data: {
      shipment,
      pricingVersion: pricing.version,
      total: quote.total,
      breakdown: quote.breakdown,
    },
  });
});
