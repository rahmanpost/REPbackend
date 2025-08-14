// backend/controllers/shipments/create.js (exported as createShipment)
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

/* ----------------------------- sanitizers ----------------------------- */
const safeString = (v, max = 2000) =>
  typeof v === 'string'
    ? v.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
    : v;

const asNum = (v, d = 0) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : d;
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function parseOtherCharges(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const c of arr.slice(0, 50)) {
    const label = safeString(c?.label ?? 'Other', 60);
    const amount = asNum(c?.amount, 0);
    if (amount >= 0) out.push({ label, amount });
  }
  return out;
}

function sanitizeItems(items) {
  if (!Array.isArray(items) || !items.length) return undefined;
  const out = [];
  for (const raw of items.slice(0, 200)) {
    const itemType = String(raw?.itemType || '').toUpperCase();
    const base = {
      itemType,
      pieces: clamp(Math.trunc(asNum(raw?.pieces, 1)), 1, 1000),
      description: safeString(raw?.description || '', 200),
      declaredValue: Math.max(0, asNum(raw?.declaredValue, 0)),
    };
    if (itemType === 'DOCUMENT') {
      out.push({
        ...base,
        weightKg: Math.max(0, asNum(raw?.weightKg, 0)),
      });
      continue;
    }
    // PARCEL
    const presetBoxSize = Number.isFinite(asNum(raw?.presetBoxSize)) ? Number(raw.presetBoxSize) : undefined;
    const dims =
      Number.isFinite(asNum(raw?.lengthCm)) &&
      Number.isFinite(asNum(raw?.widthCm)) &&
      Number.isFinite(asNum(raw?.heightCm))
        ? {
            lengthCm: Math.max(0, asNum(raw.lengthCm, 0)),
            widthCm: Math.max(0, asNum(raw.widthCm, 0)),
            heightCm: Math.max(0, asNum(raw.heightCm, 0)),
          }
        : {};
    out.push({
      ...base,
      weightKg: Math.max(0, asNum(raw?.weightKg, 0)),
      presetBoxSize,
      ...dims,
    });
  }
  return out.length ? out : undefined;
}

/* -------------------------- pricing mapper (safe) -------------------------- */
function mapPricingForCompute(prDoc, fallbackVDivisor) {
  if (!prDoc) return null;
  // Note: we pass fields as computeTotals understands them (including our new ones)
  const obj = prDoc.toObject ? prDoc.toObject() : prDoc;

  return {
    pricingVersion: obj.name,
    volumetricDivisor: obj.volumetricDivisor ?? fallbackVDivisor ?? 5000,

    // legacy knobs
    mode: obj.mode || 'WEIGHT',
    perKg: obj.perKg,
    baseFee: obj.baseFee || 0,
    minCharge: obj.minCharge || 0,
    pricePerCubicCm: obj.pricePerCubicCm || 0,
    pricePerCubicMeter: obj.pricePerCubicMeter || 0,
    taxPercent: obj.taxPercent ?? 0,

    // surcharges/extras
    fuelPct: Number(obj.fuelPct) || 0,
    remoteAreaFee: Number(obj.remoteAreaFee) || 0,
    remoteProvinces: Array.isArray(obj.remoteProvinces) ? obj.remoteProvinces : [],
    otherCharges: Array.isArray(obj.otherCharges) ? obj.otherCharges : [],

    // itemized
    perPieceSurcharge: Number(obj.perPieceSurcharge) || 0,
    documentRates: obj.documentRates
      ? {
          bands: Array.isArray(obj.documentRates.bands) ? obj.documentRates.bands : [],
          overflowPerKg:
            typeof obj.documentRates.overflowPerKg === 'number'
              ? obj.documentRates.overflowPerKg
              : 0,
        }
      : undefined,
  };
}

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
  const genOpts = { asBuffer: true, ...opts, invoiceData: meta };

  try {
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
 * - Auto-price if active Pricing exists (supports items[] and DOCUMENT bands)
 * - Save invoice PDF to disk (when totals exist) and email it (best effort)
 * - Response includes links to download invoice (dynamic + static)
 */
export const createShipment = asyncHandler(async (req, res) => {
  const body = req.body || {};

  // Sender: admin/super_admin may override, otherwise use authenticated user
  const role = String(req.user?.role || '').toLowerCase();
  const canOverrideSender = role === 'admin' || role === 'super_admin';
  const senderId = canOverrideSender && body.sender ? body.sender : req.user?._id;
  if (!senderId || !isObjectId(senderId)) return httpError(res, 400, 'Valid sender is required.');

  // Minimal required fields (legacy model still requires boxType)
  const pickupAddress = body.pickupAddress;
  const deliveryAddress = body.deliveryAddress;
  const boxType = body.boxType;

  if (!pickupAddress || !deliveryAddress) return httpError(res, 400, 'pickupAddress and deliveryAddress are required.');
  if (!boxType || !boxType.kind) return httpError(res, 400, 'boxType is required (PRESET or CUSTOM).');

  // Optional: items[] (PARCEL/DOCUMENT) — sanitized
  const items = sanitizeItems(body.items);

  // Optional labeled other charges (for computeTotals only)
  const otherChargesList = parseOtherCharges(body.otherCharges);

  // Invoice number (unique or generated)
  let finalInvoiceNumber =
    typeof body.invoiceNumber === 'string' && body.invoiceNumber.trim()
      ? safeString(body.invoiceNumber, 60)
      : null;
  if (finalInvoiceNumber) {
    const exists = await Shipment.exists({ invoiceNumber: finalInvoiceNumber });
    if (exists) return httpError(res, 409, 'invoiceNumber already exists.');
  } else {
    const isTaken = async (num) => !!(await Shipment.exists({ invoiceNumber: num }));
    finalInvoiceNumber = await generateInvoiceNumber({}, isTaken);
  }

  // Tracking ID (unique or generated)
  let finalTrackingId = null;
  if (typeof body.trackingId === 'string' && body.trackingId.trim()) {
    const id = safeString(body.trackingId, 100);
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
  const vDivisor = body.volumetricDivisor != null ? asNum(body.volumetricDivisor, 5000) : 5000;
  const weight = body.weightKg != null ? Math.max(0, asNum(body.weightKg, 0)) : 0;

  // Get active pricing
  const activePricingDoc = await Pricing.findOne({ active: true, archived: false })
    .sort({ updatedAt: -1 })
    .lean()
    .exec();

  // Map pricing to computeTotals
  const pricing = activePricingDoc ? mapPricingForCompute(activePricingDoc, vDivisor) : null;

  // Build computeTotals input
  const shipmentLike = {
    boxType,
    weightKg: weight,
    volumetricDivisor: vDivisor,
    pickupAddress,
    deliveryAddress,
    otherCharges: otherChargesList, // list for computeTotals (not persisted as list)
    items, // optional
  };

  let totals = null;
  if (pricing) totals = computeTotals(shipmentLike, pricing);

  /* --------------------------- persist Shipment --------------------------- */
  // Payment input (legacy fields only; ledger entries are added via /payments)
  const allowedPaymentStatus = new Set(['UNPAID', 'PARTIALLY_PAID', 'PAID']);
  const paymentInput = {
    mode: (body.payment?.mode === 'PICKUP' ? 'PICKUP' : 'DELIVERY'),
    method: (body.payment?.method === 'ONLINE' ? 'ONLINE' : 'CASH'),
    status: allowedPaymentStatus.has(String(body.payment?.status).toUpperCase())
      ? String(body.payment.status).toUpperCase()
      : 'UNPAID',
    transactionId: safeString(body.payment?.transactionId || '', 120) || undefined,
  };

  const doc = {
    sender: senderId,
    invoiceNumber: finalInvoiceNumber,
    trackingId: finalTrackingId,

    pickupAddress,
    deliveryAddress,

    boxType,
    weightKg: weight,
    volumetricDivisor: vDivisor,

    // NEW: persist sanitized items[] if provided
    ...(items ? { items } : {}),

    actualCharges: totals ? totals.actualCharges : 0,
    otherCharges: totals
      ? r2(
          (totals.surcharges?.fuel || 0) +
            (totals.surcharges?.remote || 0) +
            (totals.surcharges?.other || 0)
        )
      : 0,
    tax: totals ? totals.tax : 0,
    needsReprice: !totals, // false when totals exist

    // audit pricing ref
    pricingVersion: activePricingDoc?._id,

    isCOD: !!body.isCOD,
    codAmount: body.codAmount != null ? Math.max(0, asNum(body.codAmount, 0)) : 0,
    payment: paymentInput,

    currency: String(body.currency || 'AFN').toUpperCase().slice(0, 6),
    status: 'CREATED',
    notes: body.notes ? safeString(body.notes, 2000) : undefined,

    logs: [
      {
        type: 'INFO',
        message: totals
          ? `Shipment created (auto-priced${items ? ' with items' : ''})`
          : 'Shipment created (awaiting reprice)',
        at: new Date(),
        by: req.user?._id,
      },
    ],
  };

  const shipment = await Shipment.create(doc);

  // Build stable invoice URL
  const rawOrigin = process.env.API_ORIGIN || `${req.protocol}://${req.get('host') || ''}`;
  const base = rawOrigin.split('#')[0].trim().replace(/\/+$/, '');
  const invoiceUrl = `${base}/api/invoice/${shipment._id}/pdf`;

  // Safety: ensure needsReprice coherence
  if (totals && shipment.needsReprice) {
    shipment.needsReprice = false;
    await shipment.save(); // model hook will recompute payment.summary
  }

  /* -------------------------- invoice + email (bg) ------------------------- */
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

  // Respond
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
