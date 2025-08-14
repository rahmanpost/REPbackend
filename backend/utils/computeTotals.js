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

/* ---------- extras you had (kept) ---------- */
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

/* ---------- charging strategies (legacy) ---------- */
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

/* ===================== NEW: Itemized pricing helpers ===================== */

/** Price one DOCUMENT piece using bands. */
function priceDocumentPiece(weightKg = 0, documentRates = {}) {
  const bands = Array.isArray(documentRates?.bands) ? [...documentRates.bands] : [];
  if (bands.length === 0) return 0;

  // ensure numeric & sorted ascending by maxWeightKg
  bands.forEach(b => {
    b.maxWeightKg = Number(b.maxWeightKg) || 0;
    b.price = Number(b.price) || 0;
  });
  bands.sort((a, b) => a.maxWeightKg - b.maxWeightKg);

  // if weight is <=0 treat as the smallest band
  const w = Number(weightKg) > 0 ? Number(weightKg) : 0;

  const match = bands.find(b => w <= b.maxWeightKg);
  if (match) return r2(match.price);

  const top = bands[bands.length - 1];
  const overflowPerKg = Number(documentRates.overflowPerKg) || 0;
  if (overflowPerKg <= 0) return r2(top.price);

  // charge overflow per started kg beyond the highest band
  const extraKg = Math.ceil(Math.max(0, w - top.maxWeightKg));
  return r2(top.price + extraKg * overflowPerKg);
}

/** Compute per-piece chargeable weight for a PARCEL piece */
function parcelPieceChargeableKg({ presetBoxSize, lengthCm, widthCm, heightCm, weightKg }, divisor) {
  const dims = (typeof presetBoxSize === 'number' && dimensionsForBox(presetBoxSize))
    ? { length: dimensionsForBox(presetBoxSize).length, width: dimensionsForBox(presetBoxSize).width, height: dimensionsForBox(presetBoxSize).height }
    : (lengthCm && widthCm && heightCm ? { length: lengthCm, width: widthCm, height: heightCm } : null);

  const volKg = volumetricWeightKgFromDims(dims, divisor);
  const physical = Number(weightKg) || 0;
  const chargeable = Math.max(physical, volKg);
  return { dims, volumetricKg: volKg, chargeableKg: Math.round(chargeable * 10000) / 10000 };
}

/** Price one PARCEL piece using weight mode (perKg) or volume mode if configured at pricing level. */
function priceParcelPiece({ perKg, pricePerCubicMeter, pricePerCubicCm, baseFeePerPiece = 0, minChargePerPiece = 0, chargeableKg, dims }) {
  // If volume pricing is explicitly configured, prefer it; otherwise perKg
  if ((pricePerCubicMeter && pricePerCubicMeter > 0) || (pricePerCubicCm && pricePerCubicCm > 0)) {
    const volCm = volumeCm3(dims);
    let base = 0;
    if (pricePerCubicMeter && pricePerCubicMeter > 0) base = (pricePerCubicMeter * (volCm / 1_000_000)) + (baseFeePerPiece || 0);
    else base = (pricePerCubicCm * volCm) + (baseFeePerPiece || 0);
    return r2(Math.max(base, minChargePerPiece || 0));
  }

  const base = (Number(perKg) || 0) * (Number(chargeableKg) || 0) + (baseFeePerPiece || 0);
  return r2(Math.max(base, minChargePerPiece || 0));
}

/** Compute all item lines and totals. */
function computeItemsTotals(items = [], pricing = {}, divisor = 5000) {
  const perPieceSurcharge = Number(pricing.perPieceSurcharge) || 0;

  const lines = [];
  let itemsBase = 0;
  let piecesCount = 0;
  let sumVolumetricKg = 0;
  let sumChargeableKg = 0;

  for (const raw of items) {
    if (!raw || !raw.itemType) continue;
    const itemType = String(raw.itemType).toUpperCase();
    const pieces = Math.max(1, Number(raw.pieces) || 1);
    const description = (raw.description || '').toString().trim();

    if (itemType === 'DOCUMENT') {
      const perPiecePrice = priceDocumentPiece(raw.weightKg, pricing.documentRates || {});
      const perPieceSubtotal = r2(perPiecePrice + perPieceSurcharge);
      const lineTotal = r2(perPieceSubtotal * pieces);

      lines.push({
        itemType: 'DOCUMENT',
        pieces,
        description,
        weightKg: Number(raw.weightKg) || 0,
        method: 'DOCUMENT_BAND',
        perPiecePrice: r2(perPiecePrice),
        perPieceSurcharge: r2(perPieceSurcharge),
        lineTotal,
      });

      // For documents we don't compute volumetric; sum only actual (if given)
      piecesCount += pieces;
      sumChargeableKg += (Number(raw.weightKg) || 0) * pieces;
      // volumetric stays 0
      itemsBase += r2(perPiecePrice * pieces);
      continue;
    }

    // PARCEL
    const pieceWeights = parcelPieceChargeableKg(raw, divisor);
    const perPiecePrice = priceParcelPiece({
      perKg: pricing.perKg,
      pricePerCubicMeter: pricing.pricePerCubicMeter,
      pricePerCubicCm: pricing.pricePerCubicCm,
      baseFeePerPiece: 0,
      minChargePerPiece: 0,
      chargeableKg: pieceWeights.chargeableKg,
      dims: pieceWeights.dims,
    });
    const perPieceSubtotal = r2(perPiecePrice + perPieceSurcharge);
    const lineTotal = r2(perPieceSubtotal * pieces);

    lines.push({
      itemType: 'PARCEL',
      pieces,
      description,
      presetBoxSize: raw.presetBoxSize ?? null,
      dims: pieceWeights.dims,
      weightKg: Number(raw.weightKg) || 0,
      volumetricKg: pieceWeights.volumetricKg,
      chargeableKg: pieceWeights.chargeableKg,
      method: (pricing.pricePerCubicMeter || pricing.pricePerCubicCm) ? 'VOLUME' : 'WEIGHT',
      perPiecePrice: r2(perPiecePrice),
      perPieceSurcharge: r2(perPieceSurcharge),
      lineTotal,
    });

    piecesCount += pieces;
    sumVolumetricKg += (pieceWeights.volumetricKg || 0) * pieces;
    sumChargeableKg += (pieceWeights.chargeableKg || 0) * pieces;
    itemsBase += r2(perPiecePrice * pieces);
  }

  const surchargeTotal = r2(perPieceSurcharge * piecesCount);
  return {
    lines,
    piecesCount,
    itemsBase: r2(itemsBase),
    perPieceSurcharge: r2(perPieceSurcharge),
    surchargeTotal,
    sumVolumetricKg: r2(sumVolumetricKg),
    sumChargeableKg: r2(sumChargeableKg),
  };
}

/* ---------- main: computeTotals (backwards-compatible superset) ---------- */
/**
 * @param {Object} shipmentLike
 *   {
 *     // legacy
 *     boxType, dimensionsCm?, weightKg?, volumetricDivisor?,
 *     pickupAddress?, deliveryAddress?, otherCharges?,
 *     // new
 *     items?: [
 *       { itemType: 'PARCEL'|'DOCUMENT', pieces, description?, weightKg?,
 *         presetBoxSize?, lengthCm?, widthCm?, heightCm? }
 *     ]
 *   }
 * @param {Object} pricing
 *   {
 *     // legacy
 *     mode, perKg, pricePerCubicCm, pricePerCubicMeter,
 *     baseFee, minCharge, taxPercent, volumetricDivisor,
 *     fuelPct?, remoteAreaFee?, remoteProvinces?, otherCharges?, pricingVersion?,
 *     // new
 *     perPieceSurcharge?,
 *     documentRates?: { bands: [{maxWeightKg, price}], overflowPerKg? }
 *   }
 *
 * @returns {{
 *  dimensionsCm, volumetricWeightKg, chargeableWeightKg, volumetricDivisor,
 *  actualCharges, tax, otherCharges, grandTotal, breakdown,
 *  surcharges?: { fuel: number, remote: number, other: number },
 *  pricingVersion?: string
 * }}
 */
export default function computeTotals(shipmentLike = {}, pricing = {}) {
  const divisor =
    Number(pricing.volumetricDivisor) ||
    Number(shipmentLike.volumetricDivisor) ||
    5000;

  const baseFee = Number(pricing.baseFee) || 0;
  const minCharge = Number(pricing.minCharge) || 0;

  const hasItems = Array.isArray(shipmentLike.items) && shipmentLike.items.length > 0;

  // -------------------- ITEMIZED PATH --------------------
  if (hasItems) {
    const itemsInfo = computeItemsTotals(shipmentLike.items, pricing, divisor);

    // Base before surcharges: itemsBase + per-piece surcharge total
    let baseBeforeMin = r2(itemsInfo.itemsBase + itemsInfo.surchargeTotal + baseFee);
    const baseAmount = r2(Math.max(baseBeforeMin, minCharge));

    // Surcharges (fuel, remote) — same logic as legacy, applied on base
    const fuelPct = Number(pricing.fuelPct) || 0;
    const fuel = r2(baseAmount * (fuelPct / 100));

    const remote = isRemote(
      shipmentLike?.pickupAddress?.province,
      shipmentLike?.deliveryAddress?.province,
      pricing.remoteProvinces
    )
      ? r2(Number(pricing.remoteAreaFee) || 0)
      : 0;

    // Other charges (labelled lists from shipment/pricing)
    const otherList = [
      ...sumOtherCharges(shipmentLike.otherCharges),
      ...sumOtherCharges(pricing.otherCharges),
    ];
    const other = otherList.reduce((s, c) => s + c.amount, 0);

    // Tax follows same order as legacy
    const subtotal = r2(baseAmount + other);
    const taxable = r2(subtotal + fuel + remote);

    const taxPercent = Number(pricing.taxPercent ?? pricing.taxPct ?? 0);
    const tax = r2(taxable * (taxPercent / 100));

    const grandTotal = r2(taxable + tax);

    return {
      // Aggregate weights across items for transparency
      dimensionsCm: shipmentLike.dimensionsCm ?? null, // legacy dims may not reflect items; keep for compatibility
      volumetricWeightKg: itemsInfo.sumVolumetricKg,
      chargeableWeightKg: itemsInfo.sumChargeableKg,
      volumetricDivisor: divisor,

      actualCharges: baseAmount,          // base before tax & other surcharges already included baseFee/minCharge
      tax,
      otherCharges: r2(other),
      grandTotal,

      surcharges: { fuel, remote, other: r2(other) },
      pricingVersion: pricing.pricingVersion || undefined,

      breakdown: {
        mode: 'ITEMIZED',
        baseFee, minCharge,
        taxPercent,
        fuelPct,
        remoteAreaFee: pricing.remoteAreaFee ?? 0,
        remoteProvinces: Array.isArray(pricing.remoteProvinces) ? pricing.remoteProvinces : [],
        otherItems: otherList,
        items: itemsInfo.lines,
        itemsSummary: {
          totalPieces: itemsInfo.piecesCount,
          itemsBase: itemsInfo.itemsBase,
          perPieceSurcharge: itemsInfo.perPieceSurcharge,
          surchargeTotal: itemsInfo.surchargeTotal,
          sumVolumetricKg: itemsInfo.sumVolumetricKg,
          sumChargeableKg: itemsInfo.sumChargeableKg,
        },
      },
    };
  }

  // -------------------- LEGACY PATH (unchanged behavior) --------------------
  const weights = computeWeights({
    boxType: shipmentLike.boxType,
    dimensionsCm: shipmentLike.dimensionsCm,
    weightKg: shipmentLike.weightKg,
    volumetricDivisor: divisor,
  });

  const mode = pricing.mode || 'WEIGHT';

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

  const fuelPct = Number(pricing.fuelPct) || 0;
  const fuel = r2(baseAmount * (fuelPct / 100));

  const remote = isRemote(
    shipmentLike?.pickupAddress?.province,
    shipmentLike?.deliveryAddress?.province,
    pricing.remoteProvinces
  )
    ? r2(Number(pricing.remoteAreaFee) || 0)
    : 0;

  const otherList = [
    ...sumOtherCharges(shipmentLike.otherCharges),
    ...sumOtherCharges(pricing.otherCharges),
  ];
  const other = otherList.reduce((s, c) => s + c.amount, 0);

  const subtotal = r2(baseAmount + other);
  const taxable = r2(subtotal + fuel + remote);

  const taxPercent = Number(pricing.taxPercent ?? pricing.taxPct ?? 0);
  const tax = r2(taxable * (taxPercent / 100));
  const grandTotal = r2(taxable + tax);

  return {
    ...weights,
    volumetricDivisor: divisor,

    actualCharges: baseAmount,
    tax,
    otherCharges: r2(other),
    grandTotal,

    surcharges: { fuel, remote, other: r2(other) },
    pricingVersion: pricing.pricingVersion || undefined,

    breakdown: {
      mode,
      baseFee, minCharge,
      perKg: pricing.perKg ?? null,
      pricePerCubicCm: pricing.pricePerCubicCm ?? null,
      pricePerCubicMeter: pricing.pricePerCubicMeter ?? null,
      taxPercent,
      fuelPct,
      remoteAreaFee: pricing.remoteAreaFee ?? 0,
      remoteProvinces: Array.isArray(pricing.remoteProvinces)
        ? pricing.remoteProvinces
        : [],
      otherItems: otherList,
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
  // new helpers (optional exports)
  priceDocumentPiece,
  parcelPieceChargeableKg,
  computeItemsTotals,
};
