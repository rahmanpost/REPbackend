// backend/models/pricing.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * Simplified Pricing (Upgrade)
 * - mode 'WEIGHT': perKg * chargeableWeightKg (+ base/min/tax)
 * - mode 'VOLUME': pricePerCubicMeter OR pricePerCubicCm * volume (+ base/min/tax)
 * - volumetricDivisor (cm³/kg) used to compute volumetric weight
 */
const pricingSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    // Calculation mode
    mode: { type: String, enum: ['WEIGHT', 'VOLUME'], default: 'WEIGHT' },

    // Shared knobs
    baseFee: { type: Number, min: 0, default: 0 },
    minCharge: { type: Number, min: 0, default: 0 },
    taxPercent: { type: Number, min: 0, max: 100, default: 0 },

    // Weight mode
    perKg: { type: Number, min: 0, default: 0 },

    // Volume mode (choose one)
    pricePerCubicCm: { type: Number, min: 0, default: 0 },
    pricePerCubicMeter: { type: Number, min: 0, default: 0 },

    // Volumetric weight divisor (cm³/kg). Common: 5000
    volumetricDivisor: { type: Number, min: 1, default: 5000 },

    // Admin flags
    active: { type: Boolean, default: false, index: true },
    archived: { type: Boolean, default: false, index: true },

    // Audit/meta
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // Currency tag (optional; shipments default to AFN anyway)
    currency: { type: String, default: 'AFN', trim: true, uppercase: true },
  },
  { timestamps: true, versionKey: false }
);

pricingSchema.index({ active: 1, archived: 1 });
pricingSchema.index({ createdAt: -1 });

export default mongoose.models.Pricing || mongoose.model('Pricing', pricingSchema);
