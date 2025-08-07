import mongoose, { now } from 'mongoose';

import sanitizeHtml from 'sanitize-html'; // Optional, not used yet

const shipmentSchema = new mongoose.Schema(
  {
    // 👤 Sender and Invoice
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // ← Optional until assigned
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    trackingId: {
      type: String,
      unique: true,
      required: true,
      minlength: 8,
      maxlength: 20,
      trim: true,
    },

    // 💸 Pricing
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    // 👮 Agents
    pickupAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    deliveryAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // 📦 Pickup
    pickupAddress: {
      addressLine: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
    },
    pickupTimeSlot: {
      type: String,
      required: true,
    },
    pickupConfirmedAt: { type: Date },

    // 📍 Receiver
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

    // 📦 Package Info
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

    // 🕒 Delivery Info
    deliveredAt: { type: Date },
    deliveryUpdatedAt: { type: Date },

    // 💳 Payment
    payment: {
      payer: {
        type: String,
        enum: ['sender', 'receiver'],
        required: true,
        default: 'sender',
      },
      timing: {
        type: String,
        enum: ['pay-in-advance', 'pay-on-delivery'],
        required: true,
        default: now,
      },
      method: {
        type: String,
        enum: ['cash', 'online'],
        required: true,
        default: 'cash',
      },
      status: {
        type: String,
        enum: ['pending', 'paid', 'collected'],
        default: 'pending',
      },
      notifiedCustomer: {
        type: Boolean,
        default: true,
      },
      beforePhoto: { type: String },
      afterPhoto: { type: String },
      receipt: { type: String },
    },

    // 🚚 Shipment Status
    status: {
      type: String,
      enum: [
        'pending',            // Created by user
        'assigned',           // Pickup agent assigned
        'picked_up',          // Agent picked up the package
        'at_hub',             // Arrived at central hub
        'out_for_delivery',   // Delivery agent assigned
        'delivered',          // Successfully delivered
        'delivery_failed',    // Attempt failed
        'returned',           // Returned to sender
        'cancelled'           // Cancelled by user/admin
      ],
      default: 'pending',
    },

    // 🛰️ Live Tracking
    currentLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      updatedAt: { type: Date },
    },
    notifiedNear: {
      type: Boolean,
      default: false,
    },

    // 📌 Destination Coordinates (NEW)
    destinationCoordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
    }
  },
  { timestamps: true }
);

// 🔍 Indexes for performance
shipmentSchema.index({ status: 1 });
shipmentSchema.index({ pickupAgent: 1 });
shipmentSchema.index({ deliveryAgent: 1 });
shipmentSchema.index({ createdAt: -1 });

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
