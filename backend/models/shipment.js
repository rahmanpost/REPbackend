import mongoose from 'mongoose';

import sanitizeHtml from 'sanitize-html';

const sanitizedDescription = sanitizeHtml(req.body.packageDetails.description || '');
const sanitizedInstructions = sanitizeHtml(req.body.packageDetails.specialInstructions || '');

const shipment = new Shipment({
  ...otherData,
  packageDetails: {
    ...req.body.packageDetails,
    description: sanitizedDescription,
    specialInstructions: sanitizedInstructions,
  },
});


const shipmentSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    pickupAddress: {
      addressLine: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
    },

    pickupTimeSlot: {
      type: String,
      required: true,
    },

    receiver: {
      fullName: { type: String, required: true, trim: true },
      phoneNumber: {
        type: String,
        required: true,
        match: [/^\d{10,12}$/, 'Phone number must be 10 to 12 digits'],
        trim: true,
      },
      addressLine: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        match: [/.+\@.+\..+/, 'Please enter a valid email'],
      },
      nic: { type: String, trim: true },
      company: { type: String, trim: true },
    },

    packageDetails: {
      type: {
        type: String, // e.g. Document, Fragile
        required: true,
        trim: true,
      },
      weight: {
        type: Number,
        required: true,
        min: [0.1, 'Weight must be positive'],
      },
      dimensions: {
        length: { type: Number, default: 0 },
        width: { type: Number, default: 0 },
        height: { type: Number, default: 0 },
      },
      description: { type: String, trim: true },
      specialInstructions: { type: String, trim: true },
    },

    pickupConfirmedAt: { type: Date },
    deliveredAt: { type: Date },
    deliveryUpdatedAt: { type: Date },

    payment: {
      payer: {
        type: String,
        enum: ['sender', 'receiver'],
        required: true,
      },
      timing: {
        type: String,
        enum: ['pay-in-advance', 'pay-on-delivery'],
        required: true,
      },
      method: {
        type: String,
        enum: ['cash', 'online'],
        required: true,
      },
      status: {
        type: String,
        enum: ['pending', 'paid', 'collected'],
        default: 'pending',
      },
    },

    status: {
      type: String,
      enum: [
        'pickup-scheduled',
        'picked-up',
        'origin-hub',
        'in-transit',
        'delivery-failed',
        'returning',
        'delivered',
        'returned-to-sender',
        'cancelled',
      ],
      default: 'pickup-scheduled',
    },

    trackingId: {
      type: String,
      unique: true,
      required: true,
      minlength: 8,
      maxlength: 20,
      trim: true,
    },
  },
  { timestamps: true }
);

// Indexes for faster lookups
shipmentSchema.index({ status: 1 });
shipmentSchema.index({ agent: 1 });
shipmentSchema.index({ createdAt: -1 });

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
