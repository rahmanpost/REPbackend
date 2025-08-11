// backend/utils/boxPresets.js

/**
 * Box presets (dimensions in centimeters, max weights in kilograms).
 * Matches your spec:
 *  - #3: 34 × 33 × 16 → 3.5 kg
 *  - #4: 32 × 33 × 18 → 4.0 kg
 *  - #5: 34 × 34 × 32 → 8.0 kg
 *  - #6: 36 × 38 × 34 → 12.5 kg
 *  - #7: 38 × 40 × 48 → 15.5 kg
 *  - #8: 40 × 44 × 54 → 20.5 kg
 */
export const BOX_PRESETS = {
  3: { code: 3, lengthCm: 34, widthCm: 33, heightCm: 16, maxWeightKg: 3.5 },
  4: { code: 4, lengthCm: 32, widthCm: 33, heightCm: 18, maxWeightKg: 4.0 },
  5: { code: 5, lengthCm: 34, widthCm: 34, heightCm: 32, maxWeightKg: 8.0 },
  6: { code: 6, lengthCm: 36, widthCm: 38, heightCm: 34, maxWeightKg: 12.5 },
  7: { code: 7, lengthCm: 38, widthCm: 40, heightCm: 48, maxWeightKg: 15.5 },
  8: { code: 8, lengthCm: 40, widthCm: 44, heightCm: 54, maxWeightKg: 20.5 },
};

/** Return the preset object or throw if unknown. */
export function getBoxPreset(code) {
  const preset = BOX_PRESETS[code];
  if (!preset) throw new Error(`Unknown box preset code: ${code}`);
  return preset;
}

/** Convenience: return { length, width, height } in cm for a given preset code. */
export function dimensionsForBox(code) {
  const { lengthCm, widthCm, heightCm } = getBoxPreset(code);
  return { length: lengthCm, width: widthCm, height: heightCm, unit: 'cm' };
}

/** Volumetric weight in kg using cm-based divisor (default 5000 cm³/kg). */
export function volumetricWeightKgForBox(code, divisor = 5000) {
  const d = dimensionsForBox(code);
  const volCm3 = d.length * d.width * d.height;
  if (!divisor) return 0;
  return Math.round((volCm3 / divisor) * 10000) / 10000; // 4dp
}

/** Chargeable weight = max(actual kg, volumetric kg). */
export function chargeableWeightKgForBox(code, actualWeightKg = 0, divisor = 5000) {
  const volKg = volumetricWeightKgForBox(code, divisor);
  const chargeable = Math.max(Number(actualWeightKg) || 0, volKg);
  return Math.round(chargeable * 10000) / 10000;
}
