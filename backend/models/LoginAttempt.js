import mongoose from 'mongoose';
const { Schema } = mongoose;

const loginAttemptSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // email (lowercased) or other key
    count: { type: Number, default: 0, min: 0 },
    lastAttempt: { type: Date },
    lockUntil: { type: Date }, // if set in the future, deny logins
  },
  { timestamps: true }
);

loginAttemptSchema.index({ lockUntil: 1 });
export default mongoose.model('LoginAttempt', loginAttemptSchema);
