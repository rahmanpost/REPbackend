// backend/utils/computeTotals.js
import { dimensionsForBox } from './boxPresets.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* ---------- dimension & weight helpers ---------- */
function pickDims(boxType, fallbackDims) {
  if (boxType?.kind === 'PRESET' && boxType?.code != null) {
    const d = dimensionsForBox(boxType.code);
    return { length: d.length, width: d.width, height: d.height };
  }
  if (boxType?.kind === 'CUSTOM') {
    const { length, width, height } = boxType;
    if (length && width && height) return { length, width, height };
  }
  return fallbackDims || null;
}

export function volumeCm3(dims) {
  if (!dims) return 0;
  const { length, width, height } = dims;
  return (Number(length) || 0) * (Number(width) || 0) * (Number(height) || 0);
}

export function volumetricWeightKgFromDims(dims, divisor = 5000) {
  const v = volumeCm3(dims);
  if (!v || !divisor) return 0;
  return Math.round((v / divisor) * 10000) / 10000; // 4 dp
}

export function computeWeights({
  boxType,
  dimensionsCm,
  weightKg = 0,
  volumetricDivisor = 5000,
}) {
  const dims = pickDims(boxType, dimensionsCm);
  const volKg = volumetricWeightKgFromDims(dims, volumetricDivisor);
  const chargeable = Math.max(Number(weightKg) || 0, volKg);
  return {
    dimensionsCm: dims,
    volumetricWeightKg: volKg,
    chargeableWeightKg: Math.round(chargeable * 10000) / 10000,
  };
}

/* ---------- extras you didn't have (kept optional) ---------- */
function isRemote(originProvince, destProvince, remoteList = []) {
  const set = new Set((remoteList || []).map((s) => String(s).toLowerCase()));
  const o = String(originProvince || '').toLowerCase();
  const d = String(destProvince || '').toLowerCase();
  return set.has(o) || set.has(d);
}

function sumOtherCharges(otherCharges) {
  const arr = Array.isArray(otherCharges) ? otherCharges : [];
  return arr
    .map((c) => ({ label: String(c?.label || 'Other'), amount: r2(c?.amount || 0) }))
    .filter((c) => c.amount > 0);
}

/* ---------- charging strategies (unchanged behavior) ---------- */
function byWeight({ perKg = 0, chargeableWeightKg = 0, baseFee = 0, minCharge = 0 }) {
  const base = (perKg * chargeableWeightKg) + baseFee;
  return r2(Math.max(base, minCharge || 0));
}

function byVolume({ pricePerCubicMeter, pricePerCubicCm, dims, baseFee = 0, minCharge = 0 }) {
  const volCm = volumeCm3(dims);
  let base = 0;
  if (pricePerCubicMeter != null && pricePerCubicMeter > 0) {
    base = (pricePerCubicMeter * (volCm / 1_000_000)) + baseFee;
  } else if (pricePerCubicCm != null && pricePerCubicCm > 0) {
    base = (pricePerCubicCm * volCm) + baseFee;
  } else {
    base = baseFee;
  }
  return r2(Math.max(base, minCharge || 0));
}

/* ---------- main: computeTotals (backwards-compatible superset) ---------- */
/**
 * @param {Object} shipmentLike
 *   { boxType, dimensionsCm?, weightKg?, volumetricDivisor?,
 *     pickupAddress?, deliveryAddress?, otherCharges? }
 * @param {Object} pricing
 *   { mode, perKg, pricePerCubicCm, pricePerCubicMeter,
 *     baseFee, minCharge, taxPercent, volumetricDivisor,
 *     fuelPct?, remoteAreaFee?, remoteProvinces?, pricingVersion? }
 *
 * @returns {{
 *  dimensionsCm, volumetricWeightKg, chargeableWeightKg, volumetricDivisor,
 *  actualCharges, tax, otherCharges, grandTotal, breakdown,
 *  // new (optional) extras:
 *  surcharges?: { fuel: number, remote: number, other: number },
 *  pricingVersion?: string
 * }}
 */
export default function computeTotals(shipmentLike = {}, pricing = {}) {
  const divisor =
    Number(pricing.volumetricDivisor) ||
    Number(shipmentLike.volumetricDivisor) ||
    5000;

  const weights = computeWeights({
    boxType: shipmentLike.boxType,
    dimensionsCm: shipmentLike.dimensionsCm,
    weightKg: shipmentLike.weightKg,
    volumetricDivisor: divisor,
  });

  const mode = pricing.mode || 'WEIGHT';
  const baseFee = Number(pricing.baseFee) || 0;
  const minCharge = Number(pricing.minCharge) || 0;

  // Your existing "actualCharges" = base before tax; we keep that.
  const baseAmount =
    mode === 'VOLUME'
      ? byVolume({
          pricePerCubicMeter: Number(pricing.pricePerCubicMeter) || 0,
          pricePerCubicCm: Number(pricing.pricePerCubicCm) || 0,
          dims: weights.dimensionsCm,
          baseFee,
          minCharge,
        })
      : byWeight({
          perKg: Number(pricing.perKg) || 0,
          chargeableWeightKg: weights.chargeableWeightKg,
          baseFee,
          minCharge,
        });

  // ---- Optional surcharges (new, all default to 0 so nothing breaks) ----
  const fuelPct = Number(pricing.fuelPct) || 0;
  const fuel = r2(baseAmount * (fuelPct / 100));

  const remote = isRemote(
    shipmentLike?.pickupAddress?.province,
    shipmentLike?.deliveryAddress?.province,
    pricing.remoteProvinces
  )
    ? r2(Number(pricing.remoteAreaFee) || 0)
    : 0;

  // Allow other charges from either side (shipment or pricing)
  const otherList = [
    ...sumOtherCharges(shipmentLike.otherCharges),
    ...sumOtherCharges(pricing.otherCharges),
  ];
  const other = otherList.reduce((s, c) => s + c.amount, 0);

  // Subtotal follows a transparent order: base + other; then surcharges; then tax
  const subtotal = r2(baseAmount + other);
  const taxable = r2(subtotal + fuel + remote);

  const taxPercent = Number(pricing.taxPercent ?? pricing.taxPct ?? 0);
  const tax = r2(taxable * (taxPercent / 100));

  const grandTotal = r2(taxable + tax);

  return {
    ...weights,
    volumetricDivisor: divisor,

    // keep your original field names so nothing else breaks
    actualCharges: baseAmount,          // (your old meaning)
    tax,                                // still tax amount
    otherCharges: r2(other),            // remained number; list is in breakdown.surcharges.otherItems
    grandTotal,                         // final total (unchanged name)

    // richer breakdown (new, optional)
    surcharges: { fuel, remote, other: r2(other) },
    pricingVersion: pricing.pricingVersion || undefined,

    breakdown: {
      mode, baseFee, minCharge,
      perKg: pricing.perKg ?? null,
      pricePerCubicCm: pricing.pricePerCubicCm ?? null,
      pricePerCubicMeter: pricing.pricePerCubicMeter ?? null,
      taxPercent,
      fuelPct,
      remoteAreaFee: pricing.remoteAreaFee ?? 0,
      remoteProvinces: Array.isArray(pricing.remoteProvinces)
        ? pricing.remoteProvinces
        : [],
      otherItems: otherList, // preserves labels for invoicing
      // extra weight transparency
      weight: {
        actualKg: Number(shipmentLike.weightKg) || 0,
        volumetricKg: weights.volumetricWeightKg,
        chargeableKg: weights.chargeableWeightKg,
      },
    },
  };
}

// also export helpers for tests
export {
  pickDims,
  isRemote,
  sumOtherCharges,
  byWeight,
  byVolume,
};
