// backend/models/pricing.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/* ----------------------------- helpers ----------------------------- */
const safeString = (v) =>
  typeof v === 'string'
    ? v.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim()
    : v;

const finiteNonNeg = (v) => Number.isFinite(v) && v >= 0;

/* ----------------------- sub-schemas (clean) ----------------------- */

// Optional labeled “otherCharges” usable at pricing level
const otherChargeSchema = new Schema(
  {
    label: {
      type: String,
      trim: true,
      set: safeString,
      maxlength: 60,
      default: 'Other'
    },
    amount: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: finiteNonNeg,
        message: 'amount must be a non-negative number',
      },
    },
  },
  { _id: false }
);

// Document item pricing bands (per piece)
const documentBandSchema = new Schema(
  {
    maxWeightKg: {
      type: Number,
      min: 0,
      required: true,
      validate: {
        validator: (v) => Number.isFinite(v) && v >= 0,
        message: 'maxWeightKg must be >= 0',
      },
    },
    price: {
      type: Number,
      min: 0,
      required: true,
      validate: {
        validator: finiteNonNeg,
        message: 'price must be >= 0',
      },
    },
  },
  { _id: false }
);

// Wrapper for document rates
const documentRatesSchema = new Schema(
  {
    bands: {
      type: [documentBandSchema],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 50,
        message: 'bands list too long',
      },
    },
    overflowPerKg: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: finiteNonNeg,
        message: 'overflowPerKg must be >= 0',
      },
    },
  },
  { _id: false }
);

/* ----------------------------- Pricing ----------------------------- */
/**
 * Simplified Pricing (Upgrade)
 * - mode 'WEIGHT': perKg * chargeableWeightKg (+ base/min/tax)
 * - mode 'VOLUME': pricePerCubicMeter OR pricePerCubicCm * volume (+ base/min/tax)
 * - volumetricDivisor (cm³/kg) used to compute volumetric weight
 * - NEW: documentRates (for DOCUMENT items), perPieceSurcharge, fuel/remote/otherCharges
 */
const pricingSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      set: safeString,
      maxlength: 120,
      index: true,
    },

    // Calculation mode
    mode: { type: String, enum: ['WEIGHT', 'VOLUME'], default: 'WEIGHT' },

    // Shared knobs
    baseFee: { type: Number, min: 0, default: 0 },
    minCharge: { type: Number, min: 0, default: 0 },
    taxPercent: { type: Number, min: 0, max: 100, default: 0 },

    // Weight mode
    perKg: { type: Number, min: 0, default: 0 },

    // Volume mode (choose one; both allowed but computeTotals prefers m³ if set)
    pricePerCubicCm: { type: Number, min: 0, default: 0 },
    pricePerCubicMeter: { type: Number, min: 0, default: 0 },

    // Volumetric weight divisor (cm³/kg). Common: 5000
    volumetricDivisor: { type: Number, min: 1, default: 5000 },

    // Admin flags
    active: { type: Boolean, default: false, index: true },
    archived: { type: Boolean, default: false, index: true },

    // Audit/meta
    notes: { type: String, trim: true, set: safeString, maxlength: 2000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // Currency tag (optional; shipments default to AFN anyway)
    currency: { type: String, default: 'AFN', trim: true, uppercase: true, maxlength: 6 },

    /* -------------------------- NEW FIELDS -------------------------- */

    // Per-piece surcharge (applies to every piece in items[], both PARCEL & DOCUMENT)
    perPieceSurcharge: { type: Number, min: 0, default: 0 },

    // DOCUMENT items pricing
    documentRates: { type: documentRatesSchema, default: undefined },

    // Surcharges (used by computeTotals)
    fuelPct: { type: Number, min: 0, max: 100, default: 0 },
    remoteAreaFee: { type: Number, min: 0, default: 0 },

    // Provinces that count as “remote” (free text; validated at API layer)
    remoteProvinces: {
      type: [String],
      default: [],
      set: (arr) =>
        Array.isArray(arr)
          ? Array.from(
              new Set(
                arr
                  .map(safeString)
                  .filter(Boolean)
                  .map((s) => s.toString())
              )
            )
          : [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 100,
        message: 'Too many remote provinces (max 100)',
      },
    },

    // Optional pricing-level labeled charges (merged with shipment-level)
    otherCharges: {
      type: [otherChargeSchema],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 50,
        message: 'Too many other charges (max 50)',
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: true,
    strict: true,
  }
);

/* -------------------------- extra validations -------------------------- */
// Prevent obviously conflicting volume rate configuration magnitudes
pricingSchema.pre('validate', function (next) {
  try {
    // if both cubic cm and cubic meter are set very high, it’s likely a mistake
    const cm = Number(this.pricePerCubicCm) || 0;
    const m = Number(this.pricePerCubicMeter) || 0;
    if (cm > 0 && m > 0) {
      // not an error, but you can uncomment to enforce one source of truth
      // return next(new Error('Use either pricePerCubicMeter OR pricePerCubicCm, not both.'));
    }

    // active + archived should not both be true
    if (this.active && this.archived) {
      this.archived = false;
    }

    next();
  } catch (e) {
    next(e);
  }
});

pricingSchema.index({ active: 1, archived: 1 });
pricingSchema.index({ createdAt: -1 });

export default mongoose.models.Pricing || mongoose.model('Pricing', pricingSchema);
