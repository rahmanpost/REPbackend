import mongoose from 'mongoose';
const { Schema } = mongoose;

const verificationTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    consumedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('VerificationToken', verificationTokenSchema);
