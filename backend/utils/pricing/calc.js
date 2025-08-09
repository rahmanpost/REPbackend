// backend/utils/pricing/calc.js
function num(n, def = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : def;
}

function findServiceMultiplier(serviceMultipliers = [], serviceType = 'EXPRESS') {
  const key = String(serviceType || 'EXPRESS').toUpperCase();
  const found = serviceMultipliers.find(s => String(s.serviceType).toUpperCase() === key);
  return found?.multiplier ?? 1;
}

function pickZone(pricing, zoneName) {
  if (!zoneName) return null;
  const z = pricing.zones?.find(z => String(z.name).toUpperCase() === String(zoneName).toUpperCase());
  return z || null;
}

/**
 * computeTotals(input, pricing)
 * input: { weightKg, pieces, serviceType, isCOD, codAmount, zoneName, dimensionsCm?, volumetricDivisor? }
 * pricing: Pricing document
 * returns: { currency, breakdown: {...}, total }
 */
export function computeTotals(input = {}, pricing) {
  if (!pricing) throw new Error('Pricing is required');

  const currency = pricing.currency || 'AFN';
  const physicalWeightKg = Math.max(0, num(input.weightKg));
  const pieces = Math.max(1, Math.floor(num(input.pieces, 1)));
  const isCOD = !!input.isCOD;
  const codAmount = Math.max(0, num(input.codAmount));
  const serviceType = input.serviceType || 'EXPRESS';

  // Volumetric weight (cm³ / divisor) → kg
  const dims = input.dimensionsCm || {};
  const L = num(dims.length);
  const W = num(dims.width);
  const H = num(dims.height);
  const divisor = num(input.volumetricDivisor, num(pricing.volumetricDivisor, 5000));
  const volumetricWeightKg = L > 0 && W > 0 && H > 0 ? (L * W * H) / divisor : 0;

  const billableWeightKg = Math.max(physicalWeightKg, volumetricWeightKg);

  // Zone or defaults
  const zone = pickZone(pricing, input.zoneName);
  const basePerKg = num(zone?.basePerKg, pricing.defaultBasePerKg);
  const basePerPiece = num(zone?.basePerPiece, pricing.defaultBasePerPiece);
  const minCharge = num(zone?.minCharge, pricing.defaultMinCharge);

  // Subtotal from weight & piece charges
  let baseFromWeight = billableWeightKg * basePerKg;
  let baseFromPieces = pieces * basePerPiece;
  let subtotal = baseFromWeight + baseFromPieces;
  if (subtotal < minCharge) subtotal = minCharge;

  // Service multiplier
  const svcMult = num(findServiceMultiplier(pricing.serviceMultipliers, serviceType), 1);
  const serviceAmount = subtotal * (svcMult - 1);
  const afterService = subtotal * svcMult;

  // Fuel surcharge
  const fuelPct = Math.max(0, num(pricing.fuelSurchargePct));
  const fuelSurcharge = afterService * (fuelPct / 100);

  // Other fixed fees
  const otherFixed = Math.max(0, num(pricing.otherFixedFees));

  // COD fee (if applicable)
  let codFee = 0;
  if (isCOD && codAmount > 0) {
    const pct = Math.max(0, num(pricing.codFeePct));
    const min = Math.max(0, num(pricing.codFeeMin));
    codFee = Math.max(min, codAmount * (pct / 100));
  }

  const total = Math.round((afterService + fuelSurcharge + otherFixed + codFee) * 100) / 100;

  return {
    currency,
    breakdown: {
      physicalWeightKg: Math.round(physicalWeightKg * 100) / 100,
      volumetricWeightKg: Math.round(volumetricWeightKg * 100) / 100,
      billableWeightKg: Math.round(billableWeightKg * 100) / 100,
      volumetricDivisor: divisor,

      baseFromWeight: Math.round(baseFromWeight * 100) / 100,
      baseFromPieces: Math.round(baseFromPieces * 100) / 100,
      minChargeApplied: minCharge,

      serviceMultiplier: svcMult,
      serviceAmount: Math.round(serviceAmount * 100) / 100,

      fuelSurchargePct: fuelPct,
      fuelSurcharge: Math.round(fuelSurcharge * 100) / 100,

      otherFixedFees: otherFixed,
      codFee,
    },
    total,
  };
}
