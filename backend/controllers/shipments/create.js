// backend/controllers/shipments/create.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import Pricing from '../../models/pricing.js';
import { generateTrackingIdWithRetry } from '../../utils/generateTrackingId.js';
import { generateInvoiceNumber } from '../../utils/generateInvoiceNumber.js';
import computeTotals from '../../utils/computeTotals.js';
import { isObjectId, httpError } from './_shared.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Hybrid create:
 *  - Preserves your current structure/fields.
 *  - If an active Pricing exists: compute totals immediately.
 *  - If not: keep charges at 0 and set needsReprice = true (your current flow).
 */
export const createShipment = asyncHandler(async (req, res) => {
  const {
    // actors
    sender,
    // identity (optional overrides)
    invoiceNumber,
    trackingId,
    // addresses
    pickupAddress,
    deliveryAddress,
    // box & weight
    boxType,
    weightKg,
    volumetricDivisor,
    // pricing flags
    isCOD,
    codAmount,
    // payment & misc
    payment,
    notes,
    // currency (defaults to AFN)
    currency,
    // optional other charges array [{label, amount}]
    otherCharges,
  } = req.body || {};

  // Sender: admin may override, otherwise use authenticated user
  const isAdmin = String(req.user?.role || '').toUpperCase() === 'ADMIN';
  const senderId = isAdmin && sender ? sender : req.user?._id;
  if (!senderId || !isObjectId(senderId)) {
    return httpError(res, 400, 'Valid sender is required.');
  }

  // Defensive checks (validators should enforce these too)
  if (!pickupAddress || !deliveryAddress) {
    return httpError(res, 400, 'pickupAddress and deliveryAddress are required.');
  }
  if (!boxType || !boxType.kind) {
    return httpError(res, 400, 'boxType is required (PRESET or CUSTOM).');
  }

  // Invoice number: accept or generate (ensure uniqueness)
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

  // Tracking ID: accept unique or generate with retry
  let finalTrackingId = null;
  if (typeof trackingId === 'string' && trackingId.trim()) {
    const id = trackingId.trim();
    const taken = await Shipment.exists({ trackingId: id });
    if (taken) return httpError(res, 409, 'trackingId already exists.');
    finalTrackingId = id;
  } else {
    finalTrackingId = await generateTrackingIdWithRetry(
      async (id) => !!(await Shipment.exists({ trackingId: id })),
      { maxAttempts: 7 }
    );
  }

  // Defaults
  const vDivisor = volumetricDivisor != null ? Number(volumetricDivisor) : 5000;
  const weight = weightKg != null ? Number(weightKg) : 0;

  // Load active pricing (your schema uses `active` + `archived`)
  const activePricingDoc = await Pricing
    .findOne({ active: true, archived: false })
    .sort({ updatedAt: -1 })
    .lean()
    .exec();

  // Map Pricing -> computeTotals input (aligned to your model)
  const pricing = activePricingDoc
    ? {
        pricingVersion: activePricingDoc.name,          // for breakdown only
        volumetricDivisor: activePricingDoc.volumetricDivisor ?? vDivisor,
        mode: activePricingDoc.mode || 'WEIGHT',        // 'WEIGHT' | 'VOLUME'
        perKg: activePricingDoc.perKg,                  // weight mode
        baseFee: activePricingDoc.baseFee || 0,
        minCharge: activePricingDoc.minCharge || 0,
        pricePerCubicCm: activePricingDoc.pricePerCubicCm || null,      // volume mode
        pricePerCubicMeter: activePricingDoc.pricePerCubicMeter || null,
        taxPercent: activePricingDoc.taxPercent ?? 0,

        // Extras not in your model → default harmlessly:
        fuelPct: 0,
        remoteAreaFee: 0,
        remoteProvinces: [],
        otherCharges: [],
      }
    : null;

  // Build computeTotals shipment-like payload
  const shipmentLike = {
    boxType,
    weightKg: weight,
    volumetricDivisor: vDivisor,
    pickupAddress,
    deliveryAddress,
    otherCharges: Array.isArray(otherCharges) ? otherCharges : [],
  };

  // Compute totals if pricing exists; otherwise keep zeros and mark needsReprice
  let totals = null;
  if (pricing) {
    totals = computeTotals(shipmentLike, pricing);
  }

  // Build the doc according to your upgraded model
  const doc = {
    sender: senderId,

    invoiceNumber: finalInvoiceNumber,
    trackingId: finalTrackingId,

    pickupAddress,
    deliveryAddress,

    boxType,
    weightKg: weight,
    volumetricDivisor: vDivisor,

    // Charges: compute if possible, else zeros
    actualCharges: totals ? totals.actualCharges : 0,
    otherCharges: totals
      ? r2(
          (totals.surcharges?.fuel || 0) +
          (totals.surcharges?.remote || 0) +
          (totals.surcharges?.other || 0)
        )
      : 0,
    tax: totals ? totals.tax : 0,
    needsReprice: !totals,

    // Store ObjectId ref to Pricing (fixes cast error)
    pricingVersion: activePricingDoc?._id,

    // COD & payment
    isCOD: !!isCOD,
    codAmount: codAmount != null ? Number(codAmount) : 0,
    payment: {
      mode: payment?.mode || 'DELIVERY',
      method: payment?.method || 'CASH',
      status: payment?.status || 'UNPAID',
      transactionId: payment?.transactionId || undefined,
    },

    currency: currency || 'AFN',
    status: 'CREATED',
    notes: notes || undefined,

    // initial log entry
    logs: [
      {
        type: 'INFO',
        message: totals ? 'Shipment created (auto-priced)' : 'Shipment created (awaiting reprice)',
        at: new Date(),
        by: req.user?._id,
      },
    ],
  };

  const shipment = await Shipment.create(doc);
  // Model pre-validate should auto-derive dimensions, volumetricWeightKg, chargeableWeightKg

  return res.status(201).json({
    success: true,
    data: {
      ...shipment.toObject(),
      pricingLabel: activePricingDoc?.name || null, // human-readable tag (optional)
      ...(totals
        ? {
            breakdown: totals.breakdown,
            surcharges: totals.surcharges,
            grandTotal: totals.grandTotal,
          }
        : {}),
    },
  });
});

export default createShipment;
