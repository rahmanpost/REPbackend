// backend/controllers/pricingController.js
import mongoose from 'mongoose';
import Pricing from '../models/pricing.js';
import computeTotals from '../utils/computeTotals.js';
import { BOX_PRESETS } from '../utils/boxPresets.js';

/* ----------------------------- tiny helpers ----------------------------- */
const httpError = (res, code, message) =>
  res.status(code).json({ success: false, message });

const asNum = (v) => (typeof v === 'string' ? Number(v) : v);
const toNum = (v, d = 0) => {
  const n = asNum(v);
  return Number.isFinite(n) ? n : d;
};
const isPos = (v) => Number.isFinite(v) && v > 0;
const isNonNeg = (v) => Number.isFinite(v) && v >= 0;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const safeString = (v) =>
  typeof v === 'string'
    ? v.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim()
    : v;

const presetCodes = Object.keys(BOX_PRESETS).map(Number);

/* -------------------------- sanitize complex fields -------------------------- */
function parseDocumentRates(input) {
  if (!input || typeof input !== 'object') return undefined;
  const out = {};
  if (Array.isArray(input.bands)) {
    const bands = input.bands
      .slice(0, 100) // hard cap before further filtering
      .map((b) => ({
        maxWeightKg: toNum(b?.maxWeightKg, 0),
        price: toNum(b?.price, 0),
      }))
      .filter((b) => b.maxWeightKg >= 0 && b.price >= 0);
    // dedupe by maxWeightKg and sort asc
    const map = new Map();
    for (const b of bands) if (!map.has(b.maxWeightKg)) map.set(b.maxWeightKg, b);
    out.bands = Array.from(map.values()).sort((a, b) => a.maxWeightKg - b.maxWeightKg).slice(0, 50);
  } else {
    out.bands = [];
  }
  if ('overflowPerKg' in input) {
    out.overflowPerKg = Math.max(0, toNum(input.overflowPerKg, 0));
  }
  return out;
}

function parseOtherCharges(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const c of arr.slice(0, 100)) {
    const label = safeString(c?.label ?? 'Other').slice(0, 60);
    const amount = toNum(c?.amount, 0);
    if (amount >= 0) out.push({ label, amount });
    if (out.length >= 50) break;
  }
  return out;
}

function parseRemoteProvinces(v) {
  const list = Array.isArray(v)
    ? v
    : typeof v === 'string'
      ? v.split(',') : [];
  const clean = list.map(safeString).filter(Boolean).map(String);
  return Array.from(new Set(clean)).slice(0, 100);
}

/* ----------------------------- quote input helpers ----------------------------- */
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
  if (obj.weightKg != null) obj.weightKg = asNum(obj.weightKg);
  if (obj.volumetricDivisor != null) obj.volumetricDivisor = asNum(obj.volumetricDivisor);

  // Optional provinces for remote surcharge logic (free-form, sanitized)
  if (obj.pickupProvince) obj.pickupProvince = safeString(obj.pickupProvince);
  if (obj.deliveryProvince) obj.deliveryProvince = safeString(obj.deliveryProvince);

  // Optional items[] (PARCEL/DOCUMENT) for itemized quotes
  if (Array.isArray(obj.items)) {
    obj.items = obj.items.slice(0, 200).map((it) => {
      const itemType = String(it?.itemType || '').toUpperCase();
      const base = {
        itemType,
        pieces: clamp(Math.trunc(toNum(it?.pieces, 1)), 1, 1000),
        description: safeString(it?.description || '').slice(0, 200),
        declaredValue: Math.max(0, toNum(it?.declaredValue, 0)),
      };
      if (itemType === 'DOCUMENT') {
        return {
          ...base,
          weightKg: Math.max(0, toNum(it?.weightKg, 0)),
        };
      }
      // PARCEL
      const presetBoxSize = Number.isFinite(asNum(it?.presetBoxSize)) ? Number(it.presetBoxSize) : undefined;
      const dims =
        (Number.isFinite(asNum(it?.lengthCm)) &&
          Number.isFinite(asNum(it?.widthCm)) &&
          Number.isFinite(asNum(it?.heightCm)))
          ? {
              lengthCm: Math.max(0, toNum(it.lengthCm, 0)),
              widthCm: Math.max(0, toNum(it.widthCm, 0)),
              heightCm: Math.max(0, toNum(it.heightCm, 0)),
            }
          : {};
      return {
        ...base,
        weightKg: Math.max(0, toNum(it?.weightKg, 0)),
        presetBoxSize: presetBoxSize,
        ...dims,
      };
    });
  }

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

      // NEW
      perPieceSurcharge = 0,
      documentRates,
      fuelPct = 0,
      remoteAreaFee = 0,
      remoteProvinces,
      otherCharges,
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

    // NEW validations
    const _fuelPct = clamp(toNum(fuelPct, 0), 0, 100);
    const _remoteAreaFee = Math.max(0, toNum(remoteAreaFee, 0));
    const _perPieceSurcharge = Math.max(0, toNum(perPieceSurcharge, 0));
    const _remoteProvinces = parseRemoteProvinces(remoteProvinces);
    const _otherCharges = parseOtherCharges(otherCharges);
    const _documentRates = parseDocumentRates(documentRates);

    if (active) {
      await Pricing.updateMany({ active: true }, { $set: { active: false } });
    }

    const doc = await Pricing.create({
      name: safeString(String(name)).slice(0, 120),
      mode: m,
      baseFee: toNum(baseFee, 0),
      minCharge: toNum(minCharge, 0),
      taxPercent: clamp(toNum(taxPercent, 0), 0, 100),
      perKg: toNum(perKg, 0),
      pricePerCubicCm: toNum(pricePerCubicCm, 0),
      pricePerCubicMeter: toNum(pricePerCubicMeter, 0),
      volumetricDivisor: toNum(volumetricDivisor, 5000),
      active: !!active,
      notes: safeString(notes).slice(0, 2000),
      currency: String(currency || 'AFN').toUpperCase().slice(0, 6),

      // NEW
      perPieceSurcharge: _perPieceSurcharge,
      documentRates: _documentRates,
      fuelPct: _fuelPct,
      remoteAreaFee: _remoteAreaFee,
      remoteProvinces: _remoteProvinces,
      otherCharges: _otherCharges,

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

    if ('mode' in body) {
      const m = String(body.mode).toUpperCase();
      if (!['WEIGHT', 'VOLUME'].includes(m)) return httpError(res, 400, 'mode must be WEIGHT or VOLUME');
      doc.mode = m;
    }

    if ('name' in body) doc.name = safeString(String(body.name)).slice(0, 120);
    if ('notes' in body) doc.notes = safeString(String(body.notes)).slice(0, 2000);
    if ('currency' in body) doc.currency = String(body.currency).toUpperCase().slice(0, 6);

    for (const k of ['baseFee','minCharge','taxPercent','perKg','pricePerCubicCm','pricePerCubicMeter','volumetricDivisor']) {
      if (k in body) {
        const n = asNum(body[k]);
        if (!Number.isFinite(n)) return httpError(res, 400, `${k} must be a number`);
        doc[k] = k === 'taxPercent' ? clamp(n, 0, 100) : n;
      }
    }

    // NEW fields
    if ('perPieceSurcharge' in body) doc.perPieceSurcharge = Math.max(0, toNum(body.perPieceSurcharge, doc.perPieceSurcharge || 0));
    if ('fuelPct' in body) doc.fuelPct = clamp(toNum(body.fuelPct, doc.fuelPct || 0), 0, 100);
    if ('remoteAreaFee' in body) doc.remoteAreaFee = Math.max(0, toNum(body.remoteAreaFee, doc.remoteAreaFee || 0));
    if ('remoteProvinces' in body) doc.remoteProvinces = parseRemoteProvinces(body.remoteProvinces);
    if ('otherCharges' in body) doc.otherCharges = parseOtherCharges(body.otherCharges);
    if ('documentRates' in body) doc.documentRates = parseDocumentRates(body.documentRates);

    // active toggle (only one active)
    if ('active' in body) {
      const makeActive = !!body.active;
      if (makeActive) {
        await Pricing.updateMany({ active: true }, { $set: { active: false } });
      }
      doc.active = makeActive;
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
// Now supports optional items[] and optional pickup/delivery provinces
export const getQuote = async (req, res) => {
  try {
    const src = req.method === 'GET' ? req.query : req.body;
    const body = normalizeQuoteInput(src);

    // Validate box/dims input like before
    const weightKg = toNum(body.weightKg, 0);
    if (!isNonNeg(weightKg)) return httpError(res, 400, 'weightKg must be a non-negative number');

    let dims = null;
    if (body.boxType?.kind === 'PRESET') {
      const code = Number(body.boxType.code);
      if (!presetCodes.includes(code)) return httpError(res, 400, `boxType.code must be one of: ${presetCodes.join(', ')}`);
      // computeTotals will resolve dims
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
    } else if (!Array.isArray(body.items) || body.items.length === 0) {
      // When using items[], box/dims can be omitted
      return httpError(res, 400, 'Provide boxType (PRESET or CUSTOM) or dimensionsCm, or items[]');
    }

    const pricing = await loadActiveOrVersion(undefined);

    const shipmentLike = {
      boxType: body.boxType,
      dimensionsCm: dims,
      weightKg,
      volumetricDivisor: toNum(body.volumetricDivisor, pricing.volumetricDivisor || 5000),
      // Optional remote surcharge context (not required)
      pickupAddress: body.pickupProvince ? { province: body.pickupProvince } : undefined,
      deliveryAddress: body.deliveryProvince ? { province: body.deliveryProvince } : undefined,
      // Optional items[]
      items: Array.isArray(body.items) && body.items.length ? body.items : undefined,
    };

    const totals = computeTotals(shipmentLike, pricing.toObject());
    return res.json({ success: true, data: { pricingVersion: pricing._id, totals } });
  } catch (err) {
    return httpError(res, 400, err.message || 'Failed to compute quote');
  }
};

// POST /api/admin/quote/preview  (admin; allows pricingVersion override)
// Also supports items[] and optional provinces
export const adminQuotePreview = async (req, res) => {
  try {
    const src = req.body || {};
    const body = normalizeQuoteInput(src);

    const weightKg = toNum(body.weightKg, 0);
    if (!isNonNeg(weightKg)) return httpError(res, 400, 'weightKg must be a non-negative number');

    if (Array.isArray(body.items) && body.items.length) {
      // If items[] given, we allow box/dims to be omitted
    } else if (body.boxType?.kind === 'PRESET') {
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
      return httpError(res, 400, 'Provide boxType (PRESET or CUSTOM) or dimensionsCm, or items[]');
    }

    const pricing = await loadActiveOrVersion(body.pricingVersion);
    const shipmentLike = {
      boxType: body.boxType,
      dimensionsCm: body.dimensionsCm,
      weightKg,
      volumetricDivisor: toNum(body.volumetricDivisor, pricing.volumetricDivisor || 5000),
      pickupAddress: body.pickupProvince ? { province: body.pickupProvince } : undefined,
      deliveryAddress: body.deliveryProvince ? { province: body.deliveryProvince } : undefined,
      items: Array.isArray(body.items) && body.items.length ? body.items : undefined,
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
