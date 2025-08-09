import mongoose from 'mongoose';

const trackingLogSchema = new mongoose.Schema(
  {
    // Link to shipment
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true,
      index: true,
    },

    // e.g., Created, PickedUp, InTransit, ArrivedAtHub, OutForDelivery, Delivered, FailedDelivery, Returned, Cancelled
    status: { type: String, required: true, trim: true },

    // Optional human-readable note
    message: { type: String, trim: true },

    // Optional location context
    location: {
      province: { type: String, trim: true },
      district: { type: String, trim: true },
    },

    // Who added this log (agent/admin)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,     // adds createdAt, updatedAt
    versionKey: false,
  }
);

// Common queries: list logs for a shipment, newest first
trackingLogSchema.index({ shipment: 1, createdAt: -1 });

const TrackingLog = mongoose.model('TrackingLog', trackingLogSchema);
export default TrackingLog;
