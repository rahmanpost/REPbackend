// backend/controllers/shipments/create.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import Pricing from '../../models/pricing.js';
import { computeTotals } from '../../utils/pricing/calc.js';
import { generateTrackingIdWithRetry } from '../../utils/generateTrackingId.js';
import { generateInvoiceNumber } from '../../utils/generateInvoiceNumber.js';
import { normalizeEndpointsAF } from '../../utils/afghanistan.js';
import { isObjectId, httpError } from './_shared.js';



export const createShipment = asyncHandler(async (req, res) => {
  const {
    sender, invoiceNumber, agent, serviceType,
    items, weightKg, pieces, declaredValue, notes,
    isCOD, codAmount, zoneName, dimensionsCm,
  } = req.body || {};

  const senderId = sender || req.user?._id;
  if (!senderId || !isObjectId(senderId)) {
    return httpError(res, 400, 'Valid sender is required.');
  }

  // Normalize Afghanistan-only endpoints
  const ep = normalizeEndpointsAF(req.body);
  if (ep.error) return httpError(res, 400, ep.error);

  // Invoice number (accept or generate)
  let finalInvoiceNumber =
    typeof invoiceNumber === 'string' && invoiceNumber.trim()
      ? invoiceNumber.trim()
      : null;

  if (finalInvoiceNumber) {
    const exists = await Shipment.exists({ invoiceNumber: finalInvoiceNumber });
    if (exists) return httpError(res, 409, 'invoiceNumber already exists.');
  } else {
    const isTaken = async (num) => !!(await Shipment.exists({ invoiceNumber: num }));
    finalInvoiceNumber = await generateInvoiceNumber({}, isTaken);
  }

  // Tracking id (collision-safe)
  const trackingId = await generateTrackingIdWithRetry(
    async (id) => !!(await Shipment.exists({ trackingId: id })),
    { maxAttempts: 7 }
  );

  // Base doc
  const doc = {
    sender: senderId,
    agent: agent || null,
    invoiceNumber: finalInvoiceNumber,
    trackingId,
    serviceType: serviceType || 'EXPRESS',
    from: ep.from,
    to: ep.to,
    items: Array.isArray(items) ? items : undefined,
    weightKg: weightKg != null ? Number(weightKg) : undefined,
    pieces: pieces != null ? Number(pieces) : undefined,
    declaredValue: declaredValue != null ? Number(declaredValue) : undefined,
    notes: notes || undefined,
    isCOD: !!isCOD,
    codAmount: codAmount != null ? Number(codAmount) : 0,
    dimensionsCm: dimensionsCm || req.body?.dimensionsCm || undefined,
    status: 'CREATED',
  };

  // Pricing integration (volumetric etc.)
  try {
    const activePricing = await Pricing.findOne({ active: true }).lean();
    if (activePricing) {
      const input = {
        weightKg: doc.weightKg ?? 0,
        pieces: doc.pieces ?? 1,
        serviceType: doc.serviceType,
        isCOD: doc.isCOD,
        codAmount: doc.codAmount ?? 0,
        zoneName,
        dimensionsCm: doc.dimensionsCm || {},
      };
      const quote = computeTotals(input, activePricing);

      const baseFromWeight = quote.breakdown.baseFromWeight || 0;
      const baseFromPieces = quote.breakdown.baseFromPieces || 0;
      const minChargeApplied = quote.breakdown.minChargeApplied || 0;
      const rawBase = Math.round((baseFromWeight + baseFromPieces) * 100) / 100;
      const baseAfterMin = Math.max(rawBase, minChargeApplied);

      doc.baseCharge = baseAfterMin;
      doc.serviceCharge = quote.breakdown.serviceAmount || 0;
      doc.fuelSurcharge = quote.breakdown.fuelSurcharge || 0;

      const otherFixed = quote.breakdown.otherFixedFees || 0;
      const codFee = quote.breakdown.codFee || 0;
      doc.otherFees = Math.round((otherFixed + codFee) * 100) / 100;

      doc.currency = quote.currency || 'AFN';
      if (activePricing.version) doc.pricingVersion = activePricing.version;
    }
  } catch (_e) {
    // ignore pricing failure
  }

  // Merge any extra fields not covered above (do not override)
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!(k in doc)) doc[k] = v;
  }

  const shipment = await Shipment.create(doc);
  return res.status(201).json({ success: true, data: shipment });
});
