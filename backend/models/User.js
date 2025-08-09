// backend/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Address subdocument (no _id to keep docs compact)
 */
const addressSchema = new mongoose.Schema(
  {
    province: { type: String, trim: true },
    district: { type: String, trim: true },
    street: { type: String, trim: true },
    details: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * Optional agent profile (only for role === 'agent')
 */
const agentProfileSchema = new mongoose.Schema(
  {
    code: { type: String, trim: true, index: true }, // human-friendly agent code
    branch: { type: String, trim: true },
    assignedProvinces: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },

    email: { type: String, trim: true, lowercase: true, index: true },
    phone: {
      type: String,
      required: true,
      trim: true,
      // Block empty strings so they don't get indexed as unique
      validate: {
        validator: (v) => typeof v === 'string' && v.trim().length > 0,
        message: 'Phone cannot be empty',
      },
    },

    // Hidden by default; login explicitly selects it
    password: { type: String, required: true, minlength: 6, select: false },

    role: {
      type: String,
      enum: ['admin', 'agent', 'customer'],
      default: 'customer',
      index: true,
    },

    addresses: { type: [addressSchema], default: [] },

    // Only present for agents
    agentProfile: { type: agentProfileSchema, default: undefined },

    isBlocked: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    profilePicture: { type: String, trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  }
);

/**
 * Indexes
 *  - Partial unique on phone => enforces uniqueness only for non-empty strings
 *    (Allowed operators for partial filters: $exists, $eq, $gt/$gte/$lt/$lte, $type, $and/$or)
 */
userSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $exists: true, $type: 'string', $gt: '' } },
  }
);

// Helpful compound index
userSchema.index({ role: 1, phone: 1 });

/**
 * Password hash (only if changed)
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/**
 * Compare password helper
 */
userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
