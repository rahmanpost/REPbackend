// backend/models/PasswordResetToken.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const passwordResetTokenSchema = new Schema(
  {
    user:   { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token:  { type: String, required: true, unique: true, index: true },
    // Do NOT add index:true here; TTL index below handles it
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
  },
  { timestamps: true }
);

// TTL index: MongoDB auto-removes docs when expiresAt < now
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PasswordResetToken', passwordResetTokenSchema);
