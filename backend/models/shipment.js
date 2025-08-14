// backend/models/shipment.js
import mongoose from 'mongoose';
import { dimensionsForBox } from '../utils/boxPresets.js';

const { Schema } = mongoose;

/** Structured address (Afghanistan-friendly) */
const addressSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    district: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    province: { type: String, required: true, trim: true },
    postalCode: { type: String, trim: true },
    note: { type: String, trim: true },
  },
  { _id: false }
);

/** GPS point + audit for live tracking */
const locationPointSchema = new Schema(
  {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    addressText: { type: String, trim: true },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

/** Log entries for status/location/info (FORCED UPPERCASE) */
const logSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: ['INFO', 'WARN', 'ERROR', 'STATUS', 'LOCATION', 'ASSIGN'],
      default: 'INFO',
      uppercase: true,
      trim: true,
    },
    message: { type: String, trim: true },
    data: {},
  },
  { _id: false }
);

/** Simple file descriptor for /:id/files uploads */
const fileSchema = new Schema(
  {
    path: { type: String, required: true },
    filename: { type: String, required: true },
    mimetype: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

/** Box selector: PRESET (code 3–8) or CUSTOM (cm) */
const boxTypeSchema = new Schema(
  {
    kind: { type: String, enum: ['PRESET', 'CUSTOM'], required: true },
    code: { type: Number, min: 1, max: 999 }, // when PRESET
    length: { type: Number, min: 1 }, // when CUSTOM (cm)
    width: { type: Number, min: 1 },
    height: { type: Number, min: 1 },
  },
  { _id: false }
);

/** New: per-piece items (PARCEL or DOCUMENT) */
const itemSchema = new Schema(
  {
    itemType: { type: String, enum: ['PARCEL', 'DOCUMENT'], required: true },
    pieces: { type: Number, min: 1, default: 1 },
    description: { type: String, trim: true, default: '' },

    // For PARCEL items (optional for DOCUMENT)
    weightKg: { type: Number, min: 0, default: 0 }, // per-piece actual weight
    lengthCm: { type: Number, min: 0, default: 0 },
    widthCm: { type: Number, min: 0, default: 0 },
    heightCm: { type: Number, min: 0, default: 0 },
    presetBoxSize: { type: Number, enum: [3, 4, 5, 6, 7, 8], default: null },

    declaredValue: { type: Number, min: 0, default: 0 },
  },
  { _id: true } // keep _id for addressing item edits later
);

/** New: payment ledger entries (support partial/mixed) */
const paymentEntrySchema = new Schema(
  {
    amount: { type: Number, min: 0.01, required: true },
    method: { type: String, enum: ['CASH', 'CARD', 'ONLINE', 'BANK'], required: true },
    when: { type: Date, default: Date.now },
    at: { type: String, enum: ['PICKUP', 'DELIVERY', 'OFFICE', 'ONLINE'], default: 'OFFICE' },
    txnRef: { type: String, trim: true, default: '' },
    collectedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, trim: true, default: '' },
    voided: { type: Boolean, default: false },
  },
  { _id: true }
);

const shipmentSchema = new Schema(
  {
    // Actors
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pickupAgent: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deliveryAgent: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Identity
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    trackingId: { type: String, required: true, unique: true, index: true },

    // Addresses
    pickupAddress: { type: addressSchema, required: true },
    deliveryAddress: { type: addressSchema, required: true },

    // Box & dimensions (legacy, retained)
    boxType: { type: boxTypeSchema, required: true },
    dimensionsCm: {
      length: { type: Number, min: 1, required: true },
      width: { type: Number, min: 1, required: true },
      height: { type: Number, min: 1, required: true },
    },

    // Weighting (legacy, retained)
    weightKg: { type: Number, min: 0, default: 0 }, // physical
    volumetricDivisor: { type: Number, min: 1, default: 5000 }, // cm³/kg
    volumetricWeightKg: { type: Number, min: 0, default: 0 },
    chargeableWeightKg: { type: Number, min: 0, default: 0 },

    // New: items list (PARCEL/DOCUMENT)
    items: { type: [itemSchema], default: [] },

    // Pricing flags + charges (admin-managed)
    pricingVersion: { type: Schema.Types.ObjectId, ref: 'Pricing', default: null },
    needsReprice: { type: Boolean, default: false },
    actualCharges: { type: Number, min: 0, default: 0 },
    otherCharges: { type: Number, min: 0, default: 0 },
    tax: { type: Number, min: 0, default: 0 },

    // COD
    isCOD: { type: Boolean, default: false },
    codAmount: { type: Number, min: 0, default: 0 },

    currency: { type: String, default: 'AFN' },

    // Status flow
    status: {
      type: String,
      enum: [
        'CREATED',
        'PICKUP_SCHEDULED',
        'PICKED_UP',
        'AT_ORIGIN_HUB',
        'IN_TRANSIT',
        'AT_DESTINATION_HUB',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'ON_HOLD',
        'RETURN_TO_SENDER',
        'CANCELLED',
      ],
      default: 'CREATED',
      index: true,
    },

    // Live location
    lastLocation: { type: locationPointSchema, default: null },
    locationHistory: { type: [locationPointSchema], default: [] },

    // Attachments for file uploads
    attachments: {
      beforePhoto: { type: fileSchema, default: null },
      afterPhoto: { type: fileSchema, default: null },
      receipt: { type: fileSchema, default: null },
    },

    // Notes & logs
    notes: { type: String, trim: true },
    logs: { type: [logSchema], default: [] },

    // Cancellation meta
    cancellation: {
      reason: { type: String, trim: true },
      at: { type: Date },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
    },

    // Payment meta (legacy fields kept; ledger added)
    payment: {
      mode: { type: String, enum: ['PICKUP', 'DELIVERY'], default: 'DELIVERY' },
      method: { type: String, enum: ['CASH', 'ONLINE'], default: 'CASH' }, // preferred/default method

      // Expanded enum for backward-compat + partials
      status: {
        type: String,
        enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'],
        default: 'UNPAID',
      },

      collectedAt: { type: Date },
      collectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      transactionId: { type: String },

      // Authoritative summary
      summary: {
        totalDue: { type: Number, default: 0 },
        totalPaid: { type: Number, default: 0 },
        balance: { type: Number, default: 0 },
        // derived mirror of status; left here for quick reads if needed
        status: {
          type: String,
          enum: ['PENDING', 'PARTIALLY_PAID', 'PAID'],
          default: 'PENDING',
        },
      },

      // Ledger: multiple payments, mixed methods/times
      payments: { type: [paymentEntrySchema], default: [] },
    },

    meta: { lastManualEditAt: { type: Date } },
  },
  { timestamps: true }
);

/** Virtual total for convenience (actual + other + tax) */
shipmentSchema.virtual('grandTotal').get(function () {
  return (this.actualCharges || 0) + (this.otherCharges || 0) + (this.tax || 0);
});

/* ----------------- Helpers & internal calculators ----------------- */
function resolveDimensions(doc) {
  const bt = doc.boxType;
  if (!bt) return null;

  if (bt.kind === 'PRESET' && bt.code != null) {
    const d = dimensionsForBox(bt.code); // { length, width, height }
    return { length: d.length, width: d.width, height: d.height };
  }

  if (bt.kind === 'CUSTOM') {
    const { length, width, height } = bt;
    if (length && width && height) return { length, width, height };
  }

  const dims = doc.dimensionsCm;
  if (dims?.length && dims?.width && dims?.height) return dims;

  return null;
}

function volumetricFromDimsKg(dims, divisor) {
  if (!dims) return 0;
  const volCm3 = (dims.length || 0) * (dims.width || 0) * (dims.height || 0);
  if (!volCm3 || !divisor) return 0;
  return +(volCm3 / divisor).toFixed(4);
}

function recomputePaymentSummary(doc) {
  const payments = Array.isArray(doc.payment?.payments) ? doc.payment.payments : [];
  const valid = payments.filter((p) => !p.voided && typeof p.amount === 'number' && p.amount > 0);
  const totalPaid = +valid.reduce((s, p) => s + p.amount, 0).toFixed(2);
  const totalDue = +((doc.grandTotal || 0)).toFixed(2);
  const balance = Math.max(totalDue - totalPaid, 0);
  let status = 'PENDING';
  if (totalPaid > 0 && balance > 0) status = 'PARTIALLY_PAID';
  if (totalDue > 0 && balance === 0) status = 'PAID';

  doc.payment.summary.totalDue = totalDue;
  doc.payment.summary.totalPaid = totalPaid;
  doc.payment.summary.balance = +balance.toFixed(2);
  doc.payment.summary.status = status;

  // keep legacy payment.status roughly in sync (UNPAID/PARTIALLY_PAID/PAID)
  doc.payment.status = status === 'PENDING' ? 'UNPAID' : status;
}

/* -------- Hooks: auto-calc dims/weights & payment summary -------- */
shipmentSchema.pre('validate', function (next) {
  try {
    const divisor = this.volumetricDivisor || 5000;

    // Derive dimensions from boxType (or keep provided)
    const dims = resolveDimensions(this);
    if (dims) this.dimensionsCm = dims;

    // Compute volumetric & chargeable (legacy)
    const volKg = volumetricFromDimsKg(this.dimensionsCm, divisor);
    this.volumetricWeightKg = volKg;

    const physical = this.weightKg || 0;
    this.chargeableWeightKg = +Math.max(physical, volKg).toFixed(4);

    // If inputs that affect price changed, require repricing
    if (
      this.isModified('weightKg') ||
      this.isModified('dimensionsCm') ||
      this.isModified('boxType') ||
      this.isModified('volumetricDivisor')
    ) {
      this.needsReprice = true;
    }

    next();
  } catch (err) {
    next(err);
  }
});

shipmentSchema.pre('save', function (next) {
  try {
    // Ensure payment objects exist to avoid undefined access
    if (!this.payment) this.payment = {};
    if (!this.payment.summary) this.payment.summary = { totalDue: 0, totalPaid: 0, balance: 0, status: 'PENDING' };
    if (!Array.isArray(this.payment.payments)) this.payment.payments = [];

    // Recompute summary from current grandTotal & ledger
    recomputePaymentSummary(this);

    next();
  } catch (err) {
    next(err);
  }
});

/** Useful indexes */
shipmentSchema.index({ createdAt: -1 });
shipmentSchema.index({ pickupAgent: 1 });
shipmentSchema.index({ deliveryAgent: 1 });
shipmentSchema.index({
  status: 1,
  'pickupAddress.province': 1,
  'deliveryAddress.province': 1,
});

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
