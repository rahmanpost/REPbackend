// backend/controllers/shipments/reprice.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import Pricing from '../../models/pricing.js';
import computeTotals from '../../utils/computeTotals.js';

import { httpError, isObjectId } from './_shared.js';

// Invoice persistence & (re)generation
import {
  removeInvoice,
  saveInvoiceBuffer,
  toRelativeUploads,
  makeInvoiceFilename,
} from '../../utils/invoice/storage.js';
import * as invoicePDFMod from '../../utils/invoice/generateInvoicePDF.js';
import { enrichForInvoice } from '../../utils/invoice/enrich.js';
// Optional auto-email after reprice (disabled by default)
// import { emailInvoiceForShipment } from './sendInvoice.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Resolve generator regardless of export style
const genInvoice =
  (typeof invoicePDFMod === 'function' && invoicePDFMod) ||
  invoicePDFMod.default ||
  invoicePDFMod.generateInvoicePDF ||
  invoicePDFMod.generateInvoice ||
  null;

/** Convert Pricing doc -> computeTotals pricing input */
function mapPricing(prDoc, fallbackVDivisor) {
  if (!prDoc) return null;
  return {
    pricingVersion: prDoc.name,
    volumetricDivisor: prDoc.volumetricDivisor ?? fallbackVDivisor ?? 5000,
    mode: prDoc.mode || 'WEIGHT',
    perKg: prDoc.perKg,
    baseFee: prDoc.baseFee || 0,
    minCharge: prDoc.minCharge || 0,
    pricePerCubicCm: prDoc.pricePerCubicCm || null,
    pricePerCubicMeter: prDoc.pricePerCubicMeter || null,
    taxPercent: prDoc.taxPercent ?? 0,
    // extras (not used by your model — safe defaults)
    fuelPct: 0,
    remoteAreaFee: 0,
    remoteProvinces: [],
    otherCharges: [],
  };
}

/** Build computeTotals() input from a Shipment doc */
function makeShipmentLike(sh) {
  return {
    boxType: sh.boxType,
    weightKg: Number(sh.weightKg || 0),
    volumetricDivisor: Number(sh.volumetricDivisor || 5000),
    pickupAddress: sh.pickupAddress,
    deliveryAddress: sh.deliveryAddress,
    otherCharges: Array.isArray(sh.otherCharges) ? sh.otherCharges : [],
  };
}

/** Choose pricing by id/name in query/body, else active */
async function pickPricing(req) {
  const v =
    req.query?.version ||
    req.body?.pricingVersion ||
    req.body?.version ||
    null;

  if (v && isObjectId(v)) {
    const byId = await Pricing.findById(v).exec();
    if (byId) return byId;
  }
  if (v && typeof v === 'string') {
    const byName = await Pricing.findOne({ name: v }).exec();
    if (byName) return byName;
  }
  return Pricing.findOne({ active: true, archived: false }).sort({ updatedAt: -1 }).exec();
}

/* ----------------------------- PREVIEW (GET) ------------------------------ */
/**
 * GET /api/shipments/:id/reprice/preview
 * Optional: ?version=<pricingId or pricing name>
 */
export const previewRepriceShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sh = await Shipment.findById(id);
  if (!sh) return httpError(res, 404, 'Shipment not found.');

  const pricingDoc = await pickPricing(req);
  if (!pricingDoc) return httpError(res, 409, 'No active pricing found.');

  const shipmentLike = makeShipmentLike(sh);
  const pricing = mapPricing(pricingDoc, shipmentLike.volumetricDivisor);
  const totals = computeTotals(shipmentLike, pricing);

  const proposedOther = r2(
    (totals.surcharges?.fuel || 0) +
    (totals.surcharges?.remote || 0) +
    (totals.surcharges?.other || 0)
  );

  return res.json({
    success: true,
    data: {
      shipmentId: sh._id,
      pricingId: pricingDoc._id,
      pricingLabel: pricingDoc.name || null,
      breakdown: totals.breakdown,
      surcharges: totals.surcharges,
      grandTotal: totals.grandTotal,
      proposal: {
        actualCharges: totals.actualCharges,
        tax: totals.tax,
        otherCharges: proposedOther,
        needsReprice: false,
      },
    },
  });
});

/* ------------------------------ APPLY (PATCH) ----------------------------- */
/**
 * PATCH /api/shipments/:id/reprice
 * Body may include { pricingVersion?: <id or name> }
 */
export const repriceShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const sh = await Shipment.findById(id);
  if (!sh) return httpError(res, 404, 'Shipment not found.');

  const pricingDoc = await pickPricing(req);
  if (!pricingDoc) return httpError(res, 409, 'No active pricing found.');

  const shipmentLike = makeShipmentLike(sh);
  const pricing = mapPricing(pricingDoc, shipmentLike.volumetricDivisor);
  const totals = computeTotals(shipmentLike, pricing);

  // Apply new totals
  sh.actualCharges = totals.actualCharges;
  sh.tax = totals.tax;
  sh.otherCharges = r2(
    (totals.surcharges?.fuel || 0) +
    (totals.surcharges?.remote || 0) +
    (totals.surcharges?.other || 0)
  );
  sh.needsReprice = false;
  sh.pricingVersion = pricingDoc._id;

  sh.logs = sh.logs || [];
  sh.logs.push({
    type: 'INFO',
    message: `Repriced (admin): ${pricingDoc.name || 'pricing'}`,
    at: new Date(),
    by: req.user?._id,
  });

  await sh.save();

  // Refresh invoice on disk (best effort; non-fatal)
  try {
    removeInvoice(sh); // drop stale file if any

    if (genInvoice) {
      const { plain, meta } = enrichForInvoice(sh);
      let out = await genInvoice(plain, { asBuffer: true, invoiceData: meta });

      const buf = Buffer.isBuffer(out)
        ? out
        : (out?.buffer && Buffer.isBuffer(out.buffer) ? out.buffer : null);

      if (buf) {
        const abs = saveInvoiceBuffer(sh, buf);
        sh.attachments = sh.attachments || {};
        sh.attachments.invoicePdf = {
          path: toRelativeUploads(abs),
          filename: makeInvoiceFilename(sh),
          mimetype: 'application/pdf',
          size: buf.length,
          uploadedAt: new Date(),
          by: req.user?._id,
        };
        await sh.save();

        // Optional: email fresh invoice automatically
        // const customerEmail = (await User.findById(sh.sender).select('email').lean())?.email;
        // if (customerEmail) {
        //   await emailInvoiceForShipment({ shipment: sh, recipientEmail: customerEmail, pdfBuffer: buf });
        // }
      }
    }
  } catch (e) {
    console.error('[reprice] invoice refresh failed:', e?.message || e);
  }

  return res.json({
    success: true,
    data: {
      ...sh.toObject(),
      breakdown: totals.breakdown,
      surcharges: totals.surcharges,
      grandTotal: totals.grandTotal,
    },
  });
});

export default {
  previewRepriceShipment,
  repriceShipment,
};
