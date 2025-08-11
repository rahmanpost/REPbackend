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

export function computeWeights({ boxType, dimensionsCm, weightKg = 0, volumetricDivisor = 5000 }) {
  const dims = pickDims(boxType, dimensionsCm);
  const volKg = volumetricWeightKgFromDims(dims, volumetricDivisor);
  const chargeable = Math.max(Number(weightKg) || 0, volKg);
  return {
    dimensionsCm: dims,
    volumetricWeightKg: volKg,
    chargeableWeightKg: Math.round(chargeable * 10000) / 10000,
  };
}

/* ---------- charging strategies ---------- */
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

/* ---------- main: computeTotals ---------- */
/**
 * @param {Object} shipmentLike - { boxType, dimensionsCm?, weightKg?, volumetricDivisor? }
 * @param {Object} pricing - { mode, perKg, pricePerCubicCm, pricePerCubicMeter, baseFee, minCharge, taxPercent, volumetricDivisor }
 * @returns {{
 *  dimensionsCm, volumetricWeightKg, chargeableWeightKg, volumetricDivisor,
 *  actualCharges, tax, otherCharges, grandTotal, breakdown
 * }}
 */
export default function computeTotals(shipmentLike = {}, pricing = {}) {
  const divisor = Number(pricing.volumetricDivisor) || Number(shipmentLike.volumetricDivisor) || 5000;

  const weights = computeWeights({
    boxType: shipmentLike.boxType,
    dimensionsCm: shipmentLike.dimensionsCm,
    weightKg: shipmentLike.weightKg,
    volumetricDivisor: divisor,
  });

  const mode = pricing.mode || 'WEIGHT';
  const baseFee = Number(pricing.baseFee) || 0;
  const minCharge = Number(pricing.minCharge) || 0;

  const actualCharges = mode === 'VOLUME'
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

  const tax = r2(actualCharges * ((Number(pricing.taxPercent) || 0) / 100));
  const grandTotal = r2(actualCharges + tax);

  return {
    ...weights,
    volumetricDivisor: divisor,
    actualCharges,
    tax,
    otherCharges: 0, // admin can add separately
    grandTotal,
    breakdown: {
      mode, baseFee, minCharge,
      perKg: pricing.perKg ?? null,
      pricePerCubicCm: pricing.pricePerCubicCm ?? null,
      pricePerCubicMeter: pricing.pricePerCubicMeter ?? null,
      taxPercent: pricing.taxPercent ?? 0,
    },
  };
}
