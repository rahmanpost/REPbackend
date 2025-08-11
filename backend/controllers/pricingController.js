// backend/controllers/pricingController.js
import mongoose from 'mongoose';
import Pricing from '../models/pricing.js';
import computeTotals from '../utils/computeTotals.js';
import { BOX_PRESETS } from '../utils/boxPresets.js';

/* ----------------------------- tiny helpers ----------------------------- */
const httpError = (res, code, message) =>
  res.status(code).json({ success: false, message });

const asNum = (v) => (typeof v === 'string' ? Number(v) : v);
const isPos = (v) => Number.isFinite(v) && v > 0;
const isNonNeg = (v) => Number.isFinite(v) && v >= 0;

const presetCodes = Object.keys(BOX_PRESETS).map(Number);

/** Map GET-style inputs to a normalized quote payload */
function normalizeQuoteInput(src = {}) {
  const obj = { ...src };
  // Support ?boxCode=3
  if (!obj.boxType && obj.boxCode != null && obj.boxCode !== '') {
    obj.boxType = { kind: 'PRESET', code: Number(obj.boxCode) };
  }
  // Support flat ?length&width&height
  if (!obj.dimensionsCm && obj.length != null && obj.width != null && obj.height != null) {
    obj.dimensionsCm = {
      length: Number(obj.length),
      width: Number(obj.width),
      height: Number(obj.height),
    };
  }
  // Coerce weight & divisor
  if (obj.weightKg != null) obj.weightKg = asNum(obj.weightKg);
  if (obj.volumetricDivisor != null) obj.volumetricDivisor = asNum(obj.volumetricDivisor);
  return obj;
}

async function loadActiveOrVersion(versionId) {
  if (versionId) {
    if (!mongoose.Types.ObjectId.isValid(versionId)) throw new Error('Invalid pricingVersion id');
    const p = await Pricing.findById(versionId);
    if (!p) throw new Error('pricingVersion not found');
    return p;
  }
  const active = await Pricing.findOne({ active: true, archived: { $ne: true } }).sort({ updatedAt: -1 });
  if (!active) throw new Error('No active pricing configured');
  return active;
}

/* ----------------------------- CRUD (admin) ----------------------------- */

// POST /api/pricing
export const createPricing = async (req, res) => {
  try {
    const {
      name,
      mode = 'WEIGHT',
      baseFee = 0,
      minCharge = 0,
      taxPercent = 0,
      perKg = 0,
      pricePerCubicCm = 0,
      pricePerCubicMeter = 0,
      volumetricDivisor = 5000,
      active = false,
      notes = '',
      currency = 'AFN',
    } = req.body || {};

    const m = String(mode).toUpperCase();
    if (!['WEIGHT', 'VOLUME'].includes(m)) return httpError(res, 400, 'mode must be WEIGHT or VOLUME');

    if (!name || !String(name).trim()) return httpError(res, 400, 'name is required');

    if (!isNonNeg(asNum(baseFee)) || !isNonNeg(asNum(minCharge)) || !isNonNeg(asNum(taxPercent))) {
      return httpError(res, 400, 'baseFee, minCharge, taxPercent must be non-negative numbers');
    }

    if (!isPos(asNum(volumetricDivisor))) {
      return httpError(res, 400, 'volumetricDivisor must be > 0');
    }

    if (m === 'WEIGHT') {
      if (!isPos(asNum(perKg))) return httpError(res, 400, 'perKg must be > 0 in WEIGHT mode');
    } else {
      const byM3 = isPos(asNum(pricePerCubicMeter));
      const byCm3 = isPos(asNum(pricePerCubicCm));
      if (!byM3 && !byCm3) return httpError(res, 400, 'Provide pricePerCubicMeter or pricePerCubicCm in VOLUME mode');
    }

    if (active) {
      await Pricing.updateMany({ active: true }, { $set: { active: false } });
    }

    const doc = await Pricing.create({
      name: String(name).trim(),
      mode: m,
      baseFee: asNum(baseFee) ?? 0,
      minCharge: asNum(minCharge) ?? 0,
      taxPercent: asNum(taxPercent) ?? 0,
      perKg: asNum(perKg) ?? 0,
      pricePerCubicCm: asNum(pricePerCubicCm) ?? 0,
      pricePerCubicMeter: asNum(pricePerCubicMeter) ?? 0,
      volumetricDivisor: asNum(volumetricDivisor) ?? 5000,
      active: !!active,
      notes,
      currency: String(currency || 'AFN').toUpperCase(),
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    return httpError(res, 400, err.message || 'Failed to create pricing');
  }
};

// PATCH /api/pricing/:id
export const updatePricing = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return httpError(res, 400, 'Invalid id');
    const doc = await Pricing.findById(id);
    if (!doc) return httpError(res, 404, 'Pricing not found');

    const body = req.body || {};
    if (body.mode) {
      const m = String(body.mode).toUpperCase();
      if (!['WEIGHT', 'VOLUME'].includes(m)) return httpError(res, 400, 'mode must be WEIGHT or VOLUME');
      doc.mode = m;
    }
    for (const k of ['name', 'notes', 'currency']) {
      if (k in body) doc[k] = k === 'currency' ? String(body[k]).toUpperCase() : String(body[k]).trim();
    }
    for (const k of ['baseFee', 'minCharge', 'taxPercent', 'perKg', 'pricePerCubicCm', 'pricePerCubicMeter', 'volumetricDivisor']) {
      if (k in body) {
        const n = asNum(body[k]);
        if (!Number.isFinite(n)) return httpError(res, 400, `${k} must be a number`);
        doc[k] = n;
      }
    }

    // sanity checks
    if (doc.mode === 'WEIGHT' && !isPos(doc.perKg)) {
      return httpError(res, 400, 'perKg must be > 0 in WEIGHT mode');
    }
    if (doc.mode === 'VOLUME') {
      const byM3 = isPos(doc.pricePerCubicMeter);
      const byCm3 = isPos(doc.pricePerCubicCm);
      if (!byM3 && !byCm3) return httpError(res, 400, 'Provide pricePerCubicMeter or pricePerCubicCm in VOLUME mode');
    }
    if (!isPos(doc.volumetricDivisor)) {
      return httpError(res, 400, 'volumetricDivisor must be > 0');
    }

    doc.updatedBy = req.user?._id;
    await doc.save();
    return res.json({ success: true, data: doc });
  } catch (err) {
    return httpError(res, 400, err.message || 'Failed to update pricing');
  }
};

// PATCH /api/pricing/:id/activate
export const setActivePricing = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return httpError(res, 400, 'Invalid id');

    const target = await Pricing.findById(id);
    if (!target) return httpError(res, 404, 'Pricing not found');
    if (target.archived) return httpError(res, 400, 'Cannot activate an archived pricing');

    await Pricing.updateMany({ active: true }, { $set: { active: false } });
    target.active = true;
    target.updatedBy = req.user?._id;
    await target.save();

    return res.json({ success: true, data: target });
  } catch (err) {
    return httpError(res, 400, err.message || 'Failed to set active pricing');
  }
};

// GET /api/pricing/active
export const getActivePricing = async (_req, res) => {
  const active = await Pricing.findOne({ active: true, archived: { $ne: true } }).sort({ updatedAt: -1 });
  if (!active) return httpError(res, 404, 'No active pricing configured');
  return res.json({ success: true, data: active });
};

// GET /api/pricing/:id
export const getPricingById = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return httpError(res, 400, 'Invalid id');
  const doc = await Pricing.findById(id);
  if (!doc) return httpError(res, 404, 'Pricing not found');
  return res.json({ success: true, data: doc });
};

// Alias some routes expect
export const getPricing = getPricingById;

// GET /api/pricing
export const listPricing = async (req, res) => {
  const page = Math.max(1, Number(req.query?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 20));
  const includeArchived = String(req.query?.includeArchived ?? 'false') === 'true';

  const q = includeArchived ? {} : { archived: { $ne: true } };
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Pricing.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Pricing.countDocuments(q),
  ]);

  return res.json({ success: true, data: { items, total, page, limit } });
};

// DELETE /api/pricing/:id (soft)
export const deletePricing = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return httpError(res, 400, 'Invalid id');
  const doc = await Pricing.findById(id);
  if (!doc) return httpError(res, 404, 'Pricing not found');
  doc.archived = true;
  doc.active = false;
  doc.updatedBy = req.user?._id;
  await doc.save();
  return res.json({ success: true, data: doc });
};

/* ----------------------------- Quotes ----------------------------- */

// GET or POST /api/pricing/quote  (public; uses ACTIVE pricing)
export const getQuote = async (req, res) => {
  try {
    const src = req.method === 'GET' ? req.query : req.body;
    const body = normalizeQuoteInput(src);

    // Validate input
    const weightKg = asNum(body.weightKg);
    if (!isNonNeg(weightKg)) return httpError(res, 400, 'weightKg must be a non-negative number');

    let dims = null;
    if (body.boxType?.kind === 'PRESET') {
      const code = Number(body.boxType.code);
      if (!presetCodes.includes(code)) return httpError(res, 400, `boxType.code must be one of: ${presetCodes.join(', ')}`);
      // computeTotals will derive dims from code
    } else if (body.boxType?.kind === 'CUSTOM') {
      const { length, width, height } = body.boxType;
      if (!isPos(asNum(length)) || !isPos(asNum(width)) || !isPos(asNum(height))) {
        return httpError(res, 400, 'CUSTOM boxType requires positive length/width/height');
      }
    } else if (body.dimensionsCm) {
      const { length, width, height } = body.dimensionsCm;
      if (!isPos(asNum(length)) || !isPos(asNum(width)) || !isPos(asNum(height))) {
        return httpError(res, 400, 'dimensionsCm requires positive length/width/height');
      }
      dims = { length: asNum(length), width: asNum(width), height: asNum(height) };
    } else {
      return httpError(res, 400, 'Provide boxType (PRESET or CUSTOM) or dimensionsCm');
    }

    const pricing = await loadActiveOrVersion(undefined);
    const shipmentLike = {
      boxType: body.boxType,
      dimensionsCm: dims,
      weightKg,
      volumetricDivisor: asNum(body.volumetricDivisor) || pricing.volumetricDivisor || 5000,
    };

    const totals = computeTotals(shipmentLike, pricing.toObject());
    return res.json({ success: true, data: { pricingVersion: pricing._id, totals } });
  } catch (err) {
    return httpError(res, 400, err.message || 'Failed to compute quote');
  }
};

// POST /api/admin/quote/preview  (admin; allows pricingVersion override)
export const adminQuotePreview = async (req, res) => {
  try {
    const src = req.body || {};
    const body = normalizeQuoteInput(src);

    const weightKg = asNum(body.weightKg);
    if (!isNonNeg(weightKg)) return httpError(res, 400, 'weightKg must be a non-negative number');

    if (body.boxType?.kind === 'PRESET') {
      const code = Number(body.boxType.code);
      if (!presetCodes.includes(code)) return httpError(res, 400, `boxType.code must be one of: ${presetCodes.join(', ')}`);
    } else if (body.boxType?.kind === 'CUSTOM') {
      const { length, width, height } = body.boxType;
      if (!isPos(asNum(length)) || !isPos(asNum(width)) || !isPos(asNum(height))) {
        return httpError(res, 400, 'CUSTOM boxType requires positive length/width/height');
      }
    } else if (body.dimensionsCm) {
      const { length, width, height } = body.dimensionsCm;
      if (!isPos(asNum(length)) || !isPos(asNum(width)) || !isPos(asNum(height))) {
        return httpError(res, 400, 'dimensionsCm requires positive length/width/height');
      }
    } else {
      return httpError(res, 400, 'Provide boxType (PRESET or CUSTOM) or dimensionsCm');
    }

    const pricing = await loadActiveOrVersion(body.pricingVersion);
    const shipmentLike = {
      boxType: body.boxType,
      dimensionsCm: body.dimensionsCm,
      weightKg,
      volumetricDivisor: asNum(body.volumetricDivisor) || pricing.volumetricDivisor || 5000,
    };

    const totals = computeTotals(shipmentLike, pricing.toObject());
    return res.json({ success: true, data: { pricingVersion: pricing._id, totals } });
  } catch (err) {
    return httpError(res, 400, err.message || 'Failed to compute admin preview');
  }
};

export default {
  createPricing,
  updatePricing,
  setActivePricing,
  getActivePricing,
  getPricingById,
  getPricing,
  listPricing,
  deletePricing,
  getQuote,
  adminQuotePreview,
};
