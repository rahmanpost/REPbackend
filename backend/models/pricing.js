// backend/models/pricing.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const zoneRateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },   // e.g., "DOMESTIC"
    basePerKg: { type: Number, min: 0, default: 0 },
    basePerPiece: { type: Number, min: 0, default: 0 },
    minCharge: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const serviceMultiplierSchema = new Schema(
  {
    serviceType: { type: String, required: true, trim: true, uppercase: true }, // EXPRESS / ECONOMY
    multiplier: { type: Number, min: 0, default: 1 },
  },
  { _id: false }
);

const pricingSchema = new Schema(
  {
    currency: { type: String, default: 'AFN', trim: true, uppercase: true },

    defaultBasePerKg: { type: Number, min: 0, default: 0 },
    defaultBasePerPiece: { type: Number, min: 0, default: 0 },
    defaultMinCharge: { type: Number, min: 0, default: 0 },

    zones: { type: [zoneRateSchema], default: [] },
    serviceMultipliers: { type: [serviceMultiplierSchema], default: [] },

    fuelSurchargePct: { type: Number, min: 0, default: 0 },
    codFeePct: { type: Number, min: 0, default: 0 },
    codFeeMin: { type: Number, min: 0, default: 0 },
    otherFixedFees: { type: Number, min: 0, default: 0 },

    // Volumetric divisor (cm³ per kg). Common: 5000 (air), 6000 (ground)
    volumetricDivisor: { type: Number, min: 1, default: 5000 },

    version: { type: String, required: true, unique: true, index: true }, // e.g. "2025-08"
    active: { type: Boolean, default: true, index: true },

    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true, versionKey: false }
);

pricingSchema.index({ active: 1, updatedAt: -1 });

// Avoid OverwriteModelError on hot reloads
export default mongoose.models.Pricing || mongoose.model('Pricing', pricingSchema);
