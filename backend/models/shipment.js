import mongoose from 'mongoose';

const { Schema } = mongoose;

const money = { type: Number, min: 0, default: 0 };

/**
 * Address block used for sender/receiver
 */
const addressBlockSchema = new Schema(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    province: { type: String, trim: true },
    district: { type: String, trim: true },
    street: { type: String, trim: true },
    details: { type: String, trim: true },
  },
  { _id: false }
);

/**
 * Item line
 */
const itemSchema = new Schema(
  {
    description: { type: String, trim: true },
    quantity: { type: Number, min: 1, default: 1 },
    weightKg: { type: Number, min: 0 },
    value: money,
  },
  { _id: false }
);

/**
 * Geo coordinates
 */
const geoSchema = new Schema(
  {
    latitude: { type: Number },
    longitude: { type: Number },
  },
  { _id: false }
);

/**
 * File reference (for uploads like beforePhoto, afterPhoto, receipt)
 * Added to support uploadShipmentFiles without breaking existing data.
 */
const fileRefSchema = new Schema(
  {
    field: { type: String, trim: true },       // e.g., 'beforePhoto'
    originalName: { type: String, trim: true },
    fileName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number, min: 0 },
    path: { type: String, trim: true },
    uploadedAt: { type: Date },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

/**
 * Cancellation info (soft cancel)
 */
const cancellationSchema = new Schema(
  {
    reason: { type: String, trim: true, default: 'Cancelled by request' },
    at: { type: Date },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const shipmentSchema = new Schema(
  {
    // Parties
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Legacy single agent field kept for compatibility
    agent: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Optional dedicated pickup/delivery agents
    pickupAgent: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deliveryAgent: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Identifiers
    invoiceNumber: { type: String, required: true, unique: true, index: true, trim: true },
    trackingId: {
      type: String,
      required: true,
      unique: true,
      minlength: 8,
      maxlength: 40,
      index: true,
      // Note: we do NOT force uppercase here to avoid changing legacy docs;
      // controllers already generate uppercase IDs.
    },

    // Addresses & content
    from: { type: addressBlockSchema, required: true },
    to: { type: addressBlockSchema, required: true },
    items: { type: [itemSchema], default: [] },

    // Physical attributes
    weightKg: { type: Number, min: 0 },
    dimensionsCm: {
      length: { type: Number, min: 0 },
      width: { type: Number, min: 0 },
      height: { type: Number, min: 0 },
    },

    // Financials
    baseCharge: money,
    serviceCharge: money,
    fuelSurcharge: money,
    otherFees: money,
    codAmount: money, // Cash on Delivery amount
    isCOD: { type: Boolean, default: false },
    currency: { type: String, default: 'AFN' },

    // Status (kept flexible to avoid breaking existing flows)
    status: { type: String, trim: true, default: 'Created', index: true },

    // Timeline
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },

    // Location + logs
    lastLocation: {
      province: { type: String, trim: true },
      district: { type: String, trim: true },
      geo: { type: geoSchema, default: undefined },
    },

    notes: { type: String, trim: true },

    // Tracking logs
    logs: [{ type: Schema.Types.ObjectId, ref: 'TrackingLog' }],

    /**
     * NEW: Soft-cancel info (used by cancelShipment controller)
     * If not cancelled, this remains undefined.
     */
    cancellation: { type: cancellationSchema, default: undefined },

    /**
     * NEW: Optional attachments container for uploads
     * Your controller writes into whichever container exists;
     * we add 'attachments' so nothing breaks if none existed.
     */
    attachments: {
      beforePhoto: { type: fileRefSchema, default: undefined },
      afterPhoto:  { type: fileRefSchema, default: undefined },
      receipt:     { type: fileRefSchema, default: undefined },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * Indexes for common access patterns
 */
shipmentSchema.index({ status: 1, createdAt: -1 });
shipmentSchema.index({ pickupAgent: 1, createdAt: -1 });
shipmentSchema.index({ deliveryAgent: 1, createdAt: -1 });
shipmentSchema.index({ 'from.province': 1, 'to.province': 1 });

// Keep JSON clean
shipmentSchema.set('toJSON', {
  versionKey: false,
  transform(_doc, ret) {
    return ret;
  },
});

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
