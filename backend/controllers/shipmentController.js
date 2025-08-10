// backend/controllers/shipmentController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Shipment from '../models/shipment.js';
import Pricing from '../models/pricing.js';
import { computeTotals } from '../utils/pricing/calc.js';
import { generateTrackingIdWithRetry } from '../utils/generateTrackingId.js';
import { generateInvoiceNumber } from '../utils/generateInvoiceNumber.js';

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);
const toInt = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const httpError = (res, code, message) =>
  res.status(code).json({ success: false, message });

const TERMINAL_STATUSES = new Set(['DELIVERED', 'RETURNED', 'CANCELLED']);

/**
 * POST /shipments
 * Create a shipment (owner = req.user). Integrates pricing with volumetric weight.
 */
export const createShipment = asyncHandler(async (req, res) => {
  const {
    sender,
    invoiceNumber,
    agent,
    serviceType,
    from,
    to,
    items,
    weightKg,
    pieces,
    declaredValue,
    notes,
    isCOD,
    codAmount,
    zoneName,           // optional zone selector for pricing
    dimensionsCm,       // { length, width, height } optional; used for volumetric
  } = req.body || {};

  const senderId = sender || req.user?._id;
  if (!senderId || !isObjectId(senderId)) {
    return httpError(res, 400, 'Valid sender is required.');
  }

  // ——— Invoice number: accept provided or generate a unique one ———
  let finalInvoiceNumber =
    typeof invoiceNumber === 'string' && invoiceNumber.trim()
      ? invoiceNumber.trim()
      : null;

  if (finalInvoiceNumber) {
    const exists = await Shipment.exists({ invoiceNumber: finalInvoiceNumber });
    if (exists) return httpError(res, 409, 'invoiceNumber already exists.');
  } else {
    const isTaken = async (num) => !!(await Shipment.exists({ invoiceNumber: num }));
    finalInvoiceNumber = await generateInvoiceNumber({}, isTaken); // eg INV-2025-123456
  }

  // Collision-safe tracking ID
  const trackingId = await generateTrackingIdWithRetry(
    async (id) => !!(await Shipment.exists({ trackingId: id })),
    { maxAttempts: 7 }
  );

  // Build base doc
  const doc = {
    sender: senderId,
    agent: agent || null,
    invoiceNumber: finalInvoiceNumber,
    trackingId,
    serviceType: serviceType || 'EXPRESS',
    from: from || undefined,
    to: to || undefined,
    items: Array.isArray(items) ? items : undefined,
    weightKg: weightKg != null ? Number(weightKg) : undefined,
    pieces: pieces != null ? Number(pieces) : undefined,
    declaredValue: declaredValue != null ? Number(declaredValue) : undefined,
    notes: notes || undefined,
    isCOD: !!isCOD,
    codAmount: codAmount != null ? Number(codAmount) : 0,
    dimensionsCm: dimensionsCm || req.body?.dimensionsCm || undefined, // store if provided
    status: 'CREATED',
  };

  // Pricing integration with volumetric weight
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
      // Store pricing version for audit
      if (activePricing.version) doc.pricingVersion = activePricing.version;
    }
  } catch (_e) {
    // swallow pricing failure; proceed with creation
  }

  // Merge any extra fields not covered above (without overriding what we've set)
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!(k in doc)) doc[k] = v;
  }

  const shipment = await Shipment.create(doc);
  return res.status(201).json({ success: true, data: shipment });
});

/**
 * GET /shipments/my
 * List shipments for the authenticated user (sender), with filters & pagination.
 */
export const getMyShipments = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return httpError(res, 401, 'Unauthorized');

  const page = Math.max(1, toInt(req.query.page, 1));
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
  const skip = (page - 1) * limit;

  const { q, status, dateFrom, dateTo } = req.query;
  const filter = { sender: userId };

  if (q) {
    filter.$or = [
      { trackingId: String(q).toUpperCase() },
      { invoiceNumber: String(q) },
    ];
  }
  if (status) filter.status = String(status).toUpperCase();
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const [items, total] = await Promise.all([
    Shipment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Shipment.countDocuments(filter),
  ]);

  res.json({ success: true, page, limit, total, data: items });
});

/**
 * GET /shipments/:id
 * Users can see own; Agents/Admins can see any by ID/trackingId.
 */
export const getShipmentByIdForUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isId = isObjectId(id);
  const query = isId ? { _id: id } : { trackingId: String(id).toUpperCase() };

  const shipment = await Shipment.findOne(query);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const isOwner =
    req.user &&
    shipment.sender &&
    String(shipment.sender) === String(req.user._id);

  const role = String(req.user?.role || 'USER').toUpperCase();
  const elevated = role === 'ADMIN' || role === 'AGENT';

  if (!isOwner && !elevated) {
    return httpError(res, 403, 'Forbidden');
  }

  res.json({ success: true, data: shipment });
});

/**
 * DELETE /shipments/:id  (soft-cancel)
 */
export const cancelShipment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const role = String(req.user?.role || 'USER').toUpperCase();
  const elevated = role === 'ADMIN' || role === 'AGENT';
  const isOwner =
    req.user &&
    shipment.sender &&
    String(shipment.sender) === String(req.user._id);

  if (!isOwner && !elevated) return httpError(res, 403, 'Forbidden');

  const current = String(shipment.status || '').toUpperCase();
  if (TERMINAL_STATUSES.has(current)) {
    if (current === 'CANCELLED') {
      return httpError(res, 409, 'Shipment is already cancelled.');
    }
    return httpError(res, 409, `Cannot cancel a ${current.toLowerCase()} shipment.`);
  }

  shipment.status = 'CANCELLED';
  shipment.cancellation = {
    reason: reason ? String(reason) : 'Cancelled by request',
    at: new Date(),
    by: req.user?._id || null,
  };

  await shipment.save();
  res.json({ success: true, data: shipment });
});

/**
 * PUT /shipments/:id/files (agent/admin)
 */
export const uploadShipmentFiles = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  const role = String(req.user?.role || 'USER').toUpperCase();
  if (role !== 'AGENT' && role !== 'ADMIN') {
    return httpError(res, 403, 'Forbidden');
  }

  const files = req.files || {};
  const pick = (name) =>
    Array.isArray(files[name]) && files[name][0]
      ? {
          field: name,
          originalName: files[name][0].originalname,
          fileName: files[name][0].filename,
          mimeType: files[name][0].mimetype,
          size: files[name][0].size,
          path: files[name][0].path || files[name][0].location || undefined,
          uploadedAt: new Date(),
          uploadedBy: req.user?._id || null,
        }
      : null;

  const payload = {
    beforePhoto: pick('beforePhoto'),
    afterPhoto: pick('afterPhoto'),
    receipt: pick('receipt'),
  };

  for (const k of Object.keys(payload)) {
    if (!payload[k]) delete payload[k];
  }
  if (Object.keys(payload).length === 0) {
    return httpError(res, 400, 'No files uploaded.');
  }

  const snapshot = shipment.toObject({ virtuals: false, getters: false });
  let targetKey = null;
  for (const candidate of ['files', 'attachments', 'documents']) {
    if (Object.prototype.hasOwnProperty.call(snapshot, candidate)) {
      targetKey = candidate;
      break;
    }
  }
  if (!targetKey) targetKey = 'attachments';

  const existing = shipment[targetKey] || {};
  shipment[targetKey] = { ...existing, ...payload };

  await shipment.save();
  res.json({ success: true, data: { [targetKey]: shipment[targetKey] } });
});

/**
 * PATCH /api/auth/admin-or-agent/update-status/:id
 */
export const updateShipmentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body || {};

  const role = String(req.user?.role || 'USER').toUpperCase();
  if (role !== 'AGENT' && role !== 'ADMIN') {
    return httpError(res, 403, 'Forbidden');
  }

  if (!status) return httpError(res, 400, 'status is required.');

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  shipment.status = String(status).toUpperCase();
  if (notes != null) shipment.notes = String(notes);

  await shipment.save();
  res.json({ success: true, data: shipment });
});

/* ===================== Admin reprice (preview & persist) ===================== */

/**
 * GET /api/admin/shipments/:id/reprice/preview
 * Optional ?version=YYYY-MM to preview with a specific pricing version.
 * No DB writes.
 */
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

/**
 * PATCH /api/admin/shipments/:id/reprice
 * Optional ?version=YYYY-MM to reprice with a specific pricing version.
 * Persists recalculated charges.
 */
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
