import fs from 'fs';
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import Pricing from '../../models/pricing.js';
import User from '../../models/User.js';
import { generateTrackingIdWithRetry } from '../../utils/generateTrackingId.js';
import { generateInvoiceNumber } from '../../utils/generateInvoiceNumber.js';
import computeTotals from '../../utils/computeTotals.js';

// Resilient import (default or named)
import * as invoicePDFMod from '../../utils/invoice/generateInvoicePDF.js';
import { emailInvoiceForShipment } from './sendInvoice.js';
import { isObjectId, httpError } from './_shared.js';
import { enrichForInvoice } from '../../utils/invoice/enrich.js';

// Local invoice storage helpers
import {
  saveInvoiceBuffer,
  invoiceExists,
  toRelativeUploads,
  makeInvoiceFilename,
} from '../../utils/invoice/storage.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Resolve generator regardless of export style
const genInvoice =
  (typeof invoicePDFMod === 'function' && invoicePDFMod) ||
  invoicePDFMod.default ||
  invoicePDFMod.generateInvoicePDF ||
  invoicePDFMod.generateInvoice ||
  null;

// Try to generate a PDF and normalize return to { buffer?, path? }
async function tryGenerateInvoice(shipment, opts = {}) {
  if (!genInvoice) {
    console.warn('[invoice] No export found in utils/invoice/generateInvoicePDF.js');
    return { buffer: null, path: null };
  }

  const { plain, meta } = enrichForInvoice(shipment, opts.totalsHint);

  const genOpts = {
    asBuffer: true,
    ...opts,
    // Provide a rich object some generators read from options
    invoiceData: meta,
  };

  try {
    // Prefer buffer
    let out = await genInvoice(plain, genOpts);

    if (Buffer.isBuffer(out)) return { buffer: out, path: null };
    if (out?.buffer && Buffer.isBuffer(out.buffer)) return { buffer: out.buffer, path: null };
    if (typeof out === 'string') return { buffer: null, path: out };
    if (out?.path && typeof out.path === 'string') return { buffer: null, path: out.path };

    // Fallback call signature
    out = await genInvoice(plain);
    if (Buffer.isBuffer(out)) return { buffer: out, path: null };
    if (out?.buffer && Buffer.isBuffer(out.buffer)) return { buffer: out.buffer, path: null };
    if (typeof out === 'string') return { buffer: null, path: out };
    if (out?.path && typeof out.path === 'string') return { buffer: null, path: out.path };

    return { buffer: null, path: null };
  } catch (e) {
    console.error('[invoice] generateInvoice failed:', e?.message || e);
    return { buffer: null, path: null };
  }
}

/**
 * Create shipment:
 * - Auto-price if active Pricing exists
 * - Save invoice PDF to disk (when totals exist) and email it (best effort)
 * - Response includes links to download invoice (dynamic + static)
 */
export const createShipment = asyncHandler(async (req, res) => {
  const {
    sender,
    invoiceNumber,
    trackingId,
    pickupAddress,
    deliveryAddress,
    boxType,
    weightKg,
    volumetricDivisor,
    isCOD,
    codAmount,
    payment,
    notes,
    currency,
    otherCharges,
  } = req.body || {};

  // Sender: admin may override, otherwise use authenticated user
  const isAdmin = String(req.user?.role || '').toUpperCase() === 'ADMIN';
  const senderId = isAdmin && sender ? sender : req.user?._id;
  if (!senderId || !isObjectId(senderId)) return httpError(res, 400, 'Valid sender is required.');
  if (!pickupAddress || !deliveryAddress) return httpError(res, 400, 'pickupAddress and deliveryAddress are required.');
  if (!boxType || !boxType.kind) return httpError(res, 400, 'boxType is required (PRESET or CUSTOM).');

  // Invoice number
  let finalInvoiceNumber =
    typeof invoiceNumber === 'string' && invoiceNumber.trim() ? invoiceNumber.trim() : null;
  if (finalInvoiceNumber) {
    const exists = await Shipment.exists({ invoiceNumber: finalInvoiceNumber });
    if (exists) return httpError(res, 409, 'invoiceNumber already exists.');
  } else {
    const isTaken = async (num) => !!(await Shipment.exists({ invoiceNumber: num }));
    finalInvoiceNumber = await generateInvoiceNumber({}, isTaken);
  }

  // Tracking ID
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

  // Get active pricing
  const activePricingDoc = await Pricing.findOne({ active: true, archived: false })
    .sort({ updatedAt: -1 })
    .lean()
    .exec();

  // Map pricing to computeTotals
  const pricing = activePricingDoc
    ? {
        pricingVersion: activePricingDoc.name,
        volumetricDivisor: activePricingDoc.volumetricDivisor ?? vDivisor,
        mode: activePricingDoc.mode || 'WEIGHT',
        perKg: activePricingDoc.perKg,
        baseFee: activePricingDoc.baseFee || 0,
        minCharge: activePricingDoc.minCharge || 0,
        pricePerCubicCm: activePricingDoc.pricePerCubicCm || null,
        pricePerCubicMeter: activePricingDoc.pricePerCubicMeter || null,
        taxPercent: activePricingDoc.taxPercent ?? 0,
        fuelPct: 0,
        remoteAreaFee: 0,
        remoteProvinces: [],
        otherCharges: [],
      }
    : null;

  // Build computeTotals input
  const shipmentLike = {
    boxType,
    weightKg: weight,
    volumetricDivisor: vDivisor,
    pickupAddress,
    deliveryAddress,
    otherCharges: Array.isArray(otherCharges) ? otherCharges : [],
  };

  let totals = null;
  if (pricing) totals = computeTotals(shipmentLike, pricing);

  // Build and save doc
  const doc = {
    sender: senderId,
    invoiceNumber: finalInvoiceNumber,
    trackingId: finalTrackingId,

    pickupAddress,
    deliveryAddress,

    boxType,
    weightKg: weight,
    volumetricDivisor: vDivisor,

    actualCharges: totals ? totals.actualCharges : 0,
    otherCharges: totals
      ? r2(
          (totals.surcharges?.fuel || 0) +
            (totals.surcharges?.remote || 0) +
            (totals.surcharges?.other || 0)
        )
      : 0,
    tax: totals ? totals.tax : 0,
    needsReprice: !totals, // should be false when totals exist

    // audit pricing ref
    pricingVersion: activePricingDoc?._id,

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

  // Build stable invoice URL (strip any comment fragments, trim slashes)
  const rawOrigin = process.env.API_ORIGIN || `${req.protocol}://${req.get('host') || ''}`;
  const base = rawOrigin.split('#')[0].trim().replace(/\/+$/, '');
  const invoiceUrl = `${base}/api/invoice/${shipment._id}/pdf`;

  // Safety: if totals exist but needsReprice somehow ended up true, flip it and persist
  if (totals && shipment.needsReprice) {
    shipment.needsReprice = false;
    await shipment.save();
  }

  // Save invoice to disk + email (best effort, non-blocking)
  (async () => {
    try {
      if (!totals) return; // skip when needsReprice=true

      // If already saved (retry or earlier run), reuse it
      let savedAbs = invoiceExists(shipment);

      if (!savedAbs) {
        // Generate (hint totals for generators that rely on it)
        const { buffer: pdfBuffer, path: pdfPath } = await tryGenerateInvoice(shipment, {
          totalsHint: {
            actualCharges: shipment.actualCharges,
            tax: shipment.tax,
            otherCharges: shipment.otherCharges,
            grandTotal:
              (shipment.actualCharges || 0) +
              (shipment.tax || 0) +
              (shipment.otherCharges || 0),
          },
        });

        if (pdfBuffer) {
          savedAbs = saveInvoiceBuffer(shipment, pdfBuffer);
        } else if (pdfPath) {
          // Copy external path into our uploads area
          const buf = fs.readFileSync(pdfPath);
          savedAbs = saveInvoiceBuffer(shipment, buf);
        }
      }

      // Persist reference on shipment (attachments.invoicePdf)
      if (savedAbs) {
        shipment.attachments = shipment.attachments || {};
        const rel = toRelativeUploads(savedAbs);
        shipment.attachments.invoicePdf = {
          path: rel,
          filename: makeInvoiceFilename(shipment),
          mimetype: 'application/pdf',
          size: fs.statSync(savedAbs).size,
          uploadedAt: new Date(),
          by: req.user?._id,
        };
        await shipment.save();
      }

      // Email (prefer saved file)
      const senderUser = await User.findById(senderId).select('email name').lean();
      const recipientEmail = senderUser?.email;
      if (!recipientEmail) return;

      if (savedAbs) {
        await emailInvoiceForShipment({
          shipment,
          recipientEmail,
          pdfPath: savedAbs,
        });
      } else {
        // Fallback: regenerate on the fly if nothing saved (unlikely)
        const { buffer: pdfBuffer, path: pdfPath } = await tryGenerateInvoice(shipment);
        if (pdfBuffer || pdfPath) {
          await emailInvoiceForShipment({ shipment, recipientEmail, pdfBuffer, pdfPath });
        }
      }
    } catch (err) {
      console.error('[invoice save/email] post-create failed:', err?.message || err);
    }
  })();

  // Build static file link if already saved in attachments (first create may not have it yet)
  const staticRel = shipment.attachments?.invoicePdf?.path || null;
  const staticAbs = staticRel ? `${base}${staticRel}` : null;

  // Respond (include invoice links so Postman/device can download)
  return res.status(201).json({
    success: true,
    data: {
      ...shipment.toObject(),
      pricingLabel: activePricingDoc?.name || null,
      ...(totals
        ? {
            breakdown: totals.breakdown,
            surcharges: totals.surcharges,
            grandTotal: totals.grandTotal,
          }
        : {}),
      links: {
        invoicePdf: `/api/invoice/${shipment._id}/pdf`,
        invoicePdfAbsolute: invoiceUrl,
        invoiceFile: staticRel,
        invoiceFileAbsolute: staticAbs,
      },
    },
  });
});

export default createShipment;
