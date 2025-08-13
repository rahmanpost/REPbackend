import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Shipment from '../../models/shipment.js';
import Pricing from '../../models/pricing.js';
import User from '../../models/User.js';
import computeTotals from '../../utils/computeTotals.js';

// Be resilient to either default or named exports from your invoice util
import * as invoicePDFMod from '../../utils/invoice/generateInvoicePDF.js';
import { emailInvoiceForShipment } from './sendInvoice.js';
import { httpError } from './_shared.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Resolve the invoice generator regardless of export style
const genInvoice =
  (typeof invoicePDFMod === 'function' && invoicePDFMod) ||
  invoicePDFMod.default ||
  invoicePDFMod.generateInvoicePDF ||
  invoicePDFMod.generateInvoice ||
  null;

// Try to generate a PDF and normalize return to { buffer?, path? }
async function tryGenerateInvoice(shipment) {
  if (!genInvoice) {
    console.warn('[invoice] No export named default/generateInvoicePDF found in utils/invoice/generateInvoicePDF.js');
    return { buffer: null, path: null };
  }
  try {
    const out = await genInvoice(shipment, { asBuffer: true });
    if (Buffer.isBuffer(out)) return { buffer: out, path: null };
    if (out?.buffer && Buffer.isBuffer(out.buffer)) return { buffer: out.buffer, path: null };
    if (typeof out === 'string') return { buffer: null, path: out };
    if (out?.path && typeof out.path === 'string') return { buffer: null, path: out.path };

    const out2 = await genInvoice(shipment);
    if (Buffer.isBuffer(out2)) return { buffer: out2, path: null };
    if (out2?.buffer && Buffer.isBuffer(out2.buffer)) return { buffer: out2.buffer, path: null };
    if (typeof out2 === 'string') return { buffer: null, path: out2 };
    if (out2?.path && typeof out2.path === 'string') return { buffer: null, path: out2.path };

    return { buffer: null, path: null };
  } catch (e) {
    console.error('[invoice] generateInvoice failed:', e?.message || e);
    return { buffer: null, path: null };
  }
}

/** Fetch a pricing doc:
 *  - `req.query.version` or `req.body.pricingVersion` can be ObjectId or name
 *  - otherwise use active pricing
 */
async function pickPricing(req) {
  const v =
    req.query?.version ||
    req.body?.pricingVersion ||
    req.body?.version ||
    null;

  // Try by ObjectId
  if (v && mongoose.Types.ObjectId.isValid(v)) {
    const found = await Pricing.findById(v).lean();
    if (found) return found;
  }
  // Try by name
  if (v && typeof v === 'string') {
    const foundByName = await Pricing.findOne({ name: v }).lean();
    if (foundByName) return foundByName;
  }
  // Fallback to active
  return Pricing.findOne({ active: true, archived: false }).sort({ updatedAt: -1 }).lean();
}

/** Build computeTotals() input from a Shipment doc */
function toShipmentLike(sh) {
  return {
    boxType: sh.boxType,
    weightKg: sh.weightKg,
    volumetricDivisor: sh.volumetricDivisor || 5000,
    pickupAddress: sh.pickupAddress,
    deliveryAddress: sh.deliveryAddress,
    otherCharges: Array.isArray(sh.otherCharges) ? sh.otherCharges : [],
  };
}

/* ──────────────────────────────────────────────────────────────
   GET /api/shipments/:id/reprice/preview
   Returns the computed totals WITHOUT saving the shipment.
   Admin/Agent only (guarded by route).
   Optional: ?version=<pricingIdOrName>
   ────────────────────────────────────────────────────────────── */
export const previewRepriceShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shipment = await Shipment.findById(id).lean();
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const pricingDoc = await pickPricing(req);
  if (!pricingDoc) return httpError(res, 409, 'No pricing available to compute totals.');

  const pricing = {
    pricingVersion: pricingDoc.name,
    volumetricDivisor: pricingDoc.volumetricDivisor ?? shipment.volumetricDivisor ?? 5000,
    mode: pricingDoc.mode || 'WEIGHT',
    perKg: pricingDoc.perKg,
    baseFee: pricingDoc.baseFee || 0,
    minCharge: pricingDoc.minCharge || 0,
    pricePerCubicCm: pricingDoc.pricePerCubicCm || null,
    pricePerCubicMeter: pricingDoc.pricePerCubicMeter || null,
    taxPercent: pricingDoc.taxPercent ?? 0,
    fuelPct: 0,
    remoteAreaFee: 0,
    remoteProvinces: [],
    otherCharges: [],
  };

  const totals = computeTotals(toShipmentLike(shipment), pricing);

  return res.json({
    success: true,
    data: {
      shipmentId: shipment._id,
      pricingVersion: pricingDoc._id,
      pricingLabel: pricingDoc.name,
      actualCharges: totals.actualCharges,
      tax: totals.tax,
      otherCharges: r2((totals.surcharges?.fuel || 0) + (totals.surcharges?.remote || 0) + (totals.surcharges?.other || 0)),
      grandTotal: totals.grandTotal,
      breakdown: totals.breakdown,
      surcharges: totals.surcharges,
    },
  });
});

/* ──────────────────────────────────────────────────────────────
   PATCH /api/shipments/:id/reprice
   Saves new charges, sets pricingVersion, clears needsReprice,
   logs the change, regenerates invoice, and emails it (best effort).
   Body may include { pricingVersion?: <id or name> } (optional).
   Admin/Agent only (guarded by route).
   ────────────────────────────────────────────────────────────── */
export const repriceShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const pricingDoc = await pickPricing(req);
  if (!pricingDoc) return httpError(res, 409, 'No pricing available to compute totals.');

  // Compute new totals using the selected pricing
  const pricing = {
    pricingVersion: pricingDoc.name,
    volumetricDivisor: pricingDoc.volumetricDivisor ?? shipment.volumetricDivisor ?? 5000,
    mode: pricingDoc.mode || 'WEIGHT',
    perKg: pricingDoc.perKg,
    baseFee: pricingDoc.baseFee || 0,
    minCharge: pricingDoc.minCharge || 0,
    pricePerCubicCm: pricingDoc.pricePerCubicCm || null,
    pricePerCubicMeter: pricingDoc.pricePerCubicMeter || null,
    taxPercent: pricingDoc.taxPercent ?? 0,
    fuelPct: 0,
    remoteAreaFee: 0,
    remoteProvinces: [],
    otherCharges: [],
  };

  const totals = computeTotals(toShipmentLike(shipment), pricing);

  // Apply to shipment document
  shipment.actualCharges = totals.actualCharges;
  shipment.tax = totals.tax;
  shipment.otherCharges = r2((totals.surcharges?.fuel || 0) + (totals.surcharges?.remote || 0) + (totals.surcharges?.other || 0));
  shipment.needsReprice = false;
  shipment.pricingVersion = pricingDoc._id; // ObjectId for audit

  shipment.logs = shipment.logs || [];
  shipment.logs.push({
    type: 'INFO',
    message: `Repriced using "${pricingDoc.name}"`,
    at: new Date(),
    by: req.user?._id,
  });

  await shipment.save();

  // Best-effort invoice regeneration + email (non-blocking)
  (async () => {
    try {
      const senderUser = await User.findById(shipment.sender).select('email name').lean();
      const recipientEmail = senderUser?.email;
      if (!recipientEmail) return;

      const { buffer: pdfBuffer, path: pdfPath } = await tryGenerateInvoice(shipment);
      if (pdfBuffer || pdfPath) {
        await emailInvoiceForShipment({ shipment, recipientEmail, pdfBuffer, pdfPath });
      }
    } catch (err) {
      console.error('[invoice email] post-reprice failed:', err?.message || err);
    }
  })();

  return res.json({
    success: true,
    data: {
      shipmentId: shipment._id,
      pricingVersion: pricingDoc._id,
      pricingLabel: pricingDoc.name,
      actualCharges: shipment.actualCharges,
      tax: shipment.tax,
      otherCharges: shipment.otherCharges,
      grandTotal: totals.grandTotal,
      breakdown: totals.breakdown,
      surcharges: totals.surcharges,
      needsReprice: shipment.needsReprice,
    },
  });
});
