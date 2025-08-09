// backend/controllers/pricingController.js
import asyncHandler from 'express-async-handler';
import Pricing from '../models/pricing.js';
import { computeTotals } from '../utils/pricing/calc.js';

/* ---------------- In-memory cache for active pricing ---------------- */
let ACTIVE_CACHE = { version: null, pricing: null, cachedAt: 0 };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getActivePricingCached() {
  const now = Date.now();
  if (ACTIVE_CACHE.pricing && now - ACTIVE_CACHE.cachedAt < CACHE_TTL_MS) {
    return ACTIVE_CACHE.pricing;
  }
  const doc = await Pricing.findOne({ active: true }).sort({ updatedAt: -1 }).lean();
  if (doc) ACTIVE_CACHE = { version: doc.version, pricing: doc, cachedAt: now };
  return doc;
}
function bustCache() {
  ACTIVE_CACHE = { version: null, pricing: null, cachedAt: 0 };
}

/* ---------------- Small helpers ---------------- */
const asNum = (v, d = undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
function validatePricingBody(body, { partial = false } = {}) {
  const errors = [];

  const must = (cond, msg) => { if (!cond) errors.push(msg); };

  if (!partial) {
    must(!!body.version, 'version is required');
  }

  // Optional numeric checks (ignore undefined fields on partial)
  const nums = [
    ['defaultBasePerKg', 0],
    ['defaultBasePerPiece', 0],
    ['defaultMinCharge', 0],
    ['fuelSurchargePct', 0],
    ['codFeePct', 0],
    ['codFeeMin', 0],
    ['otherFixedFees', 0],
  ];
  for (const [key, min] of nums) {
    if (body[key] !== undefined) {
      const n = asNum(body[key], NaN);
      if (!Number.isFinite(n) || n < min) errors.push(`${key} must be a number >= ${min}`);
    }
  }

  // zones/serviceMultipliers if present must be arrays
  if (body.zones !== undefined && !Array.isArray(body.zones)) errors.push('zones must be an array');
  if (body.serviceMultipliers !== undefined && !Array.isArray(body.serviceMultipliers)) errors.push('serviceMultipliers must be an array');

  return errors;
}

/* ---------------- Admin: create pricing ---------------- */
export const createPricing = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const errors = validatePricingBody(body);
  if (errors.length) return res.status(400).json({ success: false, message: errors.join('; ') });

  if (body.active === true) {
    await Pricing.updateMany({ active: true }, { $set: { active: false } });
  }

  const doc = await Pricing.create({
    currency: body.currency ? String(body.currency).toUpperCase().trim() : 'AFN',
    defaultBasePerKg: asNum(body.defaultBasePerKg, 0),
    defaultBasePerPiece: asNum(body.defaultBasePerPiece, 0),
    defaultMinCharge: asNum(body.defaultMinCharge, 0),
    zones: Array.isArray(body.zones) ? body.zones : [],
    serviceMultipliers: Array.isArray(body.serviceMultipliers) ? body.serviceMultipliers : [],
    fuelSurchargePct: asNum(body.fuelSurchargePct, 0),
    codFeePct: asNum(body.codFeePct, 0),
    codFeeMin: asNum(body.codFeeMin, 0),
    otherFixedFees: asNum(body.otherFixedFees, 0),
    version: String(body.version),
    active: body.active !== false,
    notes: body.notes || '',
  });

  bustCache();
  res.status(201).json({ success: true, data: doc });
});

/* ---------------- Admin: list pricing versions ---------------- */
export const listPricing = asyncHandler(async (_req, res) => {
  const docs = await Pricing.find().sort({ active: -1, updatedAt: -1 }).lean();
  res.json({ success: true, data: docs });
});

/* ---------------- Admin: get a pricing doc ---------------- */
export const getPricing = asyncHandler(async (req, res) => {
  const doc = await Pricing.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: doc });
});

/* ---------------- Admin: update pricing ---------------- */
export const updatePricing = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const errors = validatePricingBody(body, { partial: true });
  if (errors.length) return res.status(400).json({ success: false, message: errors.join('; ') });

  if (body.active === true) {
    await Pricing.updateMany({ _id: { $ne: id }, active: true }, { $set: { active: false } });
  }

  const set = {};
  if (body.currency !== undefined) set.currency = String(body.currency).toUpperCase().trim();
  if (body.version !== undefined) set.version = String(body.version);
  if (body.notes !== undefined) set.notes = body.notes;

  const numeric = [
    'defaultBasePerKg',
    'defaultBasePerPiece',
    'defaultMinCharge',
    'fuelSurchargePct',
    'codFeePct',
    'codFeeMin',
    'otherFixedFees',
  ];
  for (const k of numeric) if (body[k] !== undefined) set[k] = asNum(body[k], 0);
  if (body.zones !== undefined) set.zones = Array.isArray(body.zones) ? body.zones : [];
  if (body.serviceMultipliers !== undefined) set.serviceMultipliers = Array.isArray(body.serviceMultipliers) ? body.serviceMultipliers : [];
  if (body.active !== undefined) set.active = !!body.active;

  const doc = await Pricing.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Not found' });

  bustCache();
  res.json({ success: true, data: doc });
});

/* ---------------- Admin: delete/deactivate pricing ---------------- */
export const deletePricing = asyncHandler(async (req, res) => {
  const hard = String(req.query.hard || '').toLowerCase() === 'true';
  if (hard) await Pricing.findByIdAndDelete(req.params.id);
  else await Pricing.findByIdAndUpdate(req.params.id, { $set: { active: false } });

  bustCache();
  res.json({ success: true, message: hard ? 'Deleted' : 'Deactivated' });
});

/* ---------------- Public/Agent: get active (cached) ---------------- */
export const getActivePricing = asyncHandler(async (_req, res) => {
  const doc = await getActivePricingCached();
  if (!doc) return res.status(404).json({ success: false, message: 'No active pricing found' });
  res.json({ success: true, data: doc });
});

/* ---------------- Public/Agent: quote ---------------- */
/**
 * Body: {
 *   weightKg, pieces, serviceType, isCOD, codAmount,
 *   zoneName (optional)
 * }
 */
export const getQuote = asyncHandler(async (req, res) => {
  const pricing = await getActivePricingCached();
  if (!pricing) return res.status(404).json({ success: false, message: 'No active pricing found' });

  const input = req.body || {};
  // Basic validation
  if (input.weightKg == null && input.pieces == null) {
    return res.status(400).json({ success: false, message: 'Provide weightKg and/or pieces.' });
  }
  if (input.weightKg != null && !Number.isFinite(Number(input.weightKg))) {
    return res.status(400).json({ success: false, message: 'weightKg must be a number.' });
  }
  if (input.pieces != null && !Number.isFinite(Number(input.pieces))) {
    return res.status(400).json({ success: false, message: 'pieces must be a number.' });
  }
  if (input.codAmount != null && !Number.isFinite(Number(input.codAmount))) {
    return res.status(400).json({ success: false, message: 'codAmount must be a number.' });
  }

  const result = computeTotals(input, pricing);
  res.json({ success: true, data: result });
});







// (reuse existing cache if you have it; otherwise this tiny helper is fine)
let ADMIN_ACTIVE_CACHE = { pricing: null, ts: 0 };
const ADMIN_CACHE_TTL = 10 * 60 * 1000;

async function getActivePricingForAdmin() {
  const now = Date.now();
  if (ADMIN_ACTIVE_CACHE.pricing && now - ADMIN_ACTIVE_CACHE.ts < ADMIN_CACHE_TTL) {
    return ADMIN_ACTIVE_CACHE.pricing;
  }
  const doc = await Pricing.findOne({ active: true }).sort({ updatedAt: -1 }).lean();
  if (doc) ADMIN_ACTIVE_CACHE = { pricing: doc, ts: now };
  return doc;
}

/**
 * GET /api/admin/pricing/quote
 * Query params:
 *   weightKg, pieces, serviceType, zoneName, isCOD, codAmount, length, width, height
 * Example:
 *   /api/admin/pricing/quote?weightKg=2.5&pieces=1&serviceType=EXPRESS&zoneName=DOMESTIC&isCOD=true&codAmount=2500&length=30&width=20&height=15
 */
export const adminQuotePreview = asyncHandler(async (req, res) => {
  const pricing = await getActivePricingForAdmin();
  if (!pricing) return res.status(404).json({ success: false, message: 'No active pricing found' });

  const q = req.query || {};
  const num = (v) => (v == null ? undefined : Number(v));
  const bool = (v) => {
    if (v == null) return false;
    const s = String(v).toLowerCase().trim();
    return s === '1' || s === 'true' || s === 'yes';
  };

  // Validate numeric inputs when present
  const errors = [];
  for (const [key, label] of [
    ['weightKg', 'weightKg'],
    ['pieces', 'pieces'],
    ['codAmount', 'codAmount'],
    ['length', 'length'],
    ['width', 'width'],
    ['height', 'height'],
  ]) {
    if (q[key] != null && !Number.isFinite(Number(q[key]))) errors.push(`${label} must be a number`);
  }
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors.join('; ') });
  }

  const input = {
    weightKg: num(q.weightKg) ?? 0,
    pieces: num(q.pieces) ?? 1,
    serviceType: q.serviceType || 'EXPRESS',
    zoneName: q.zoneName,
    isCOD: bool(q.isCOD),
    codAmount: num(q.codAmount) ?? 0,
    dimensionsCm:
      q.length || q.width || q.height
        ? {
            length: num(q.length) ?? 0,
            width: num(q.width) ?? 0,
            height: num(q.height) ?? 0,
          }
        : {},
  };

  const result = computeTotals(input, pricing);
  return res.json({ success: true, data: result, input });
});
