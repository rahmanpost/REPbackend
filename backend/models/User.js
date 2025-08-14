// backend/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, AGENT_TYPES } from './roles.js';

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
 * Optional agent profile (extra metadata; role/agentType govern access)
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

// Back-compat mapper for legacy lowercase roles
const normalizeRole = (v) => {
  if (!v) return v;
  const up = String(v).toUpperCase();
  // Map legacy set {admin, agent, customer} -> constants
  if (up === 'ADMIN') return ROLES.ADMIN;
  if (up === 'AGENT') return ROLES.AGENT;
  if (up === 'CUSTOMER') return ROLES.CUSTOMER;
  if (up === 'SUPER_ADMIN') return ROLES.SUPER_ADMIN;
  return up; // in case caller already used our constants
};

// validator to allow null/undefined for agentType, or a valid enum value
const validateAgentType = (v) =>
  v == null || Object.values(AGENT_TYPES).includes(v);

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },

    email: { type: String, trim: true, lowercase: true, index: true },
    phone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v) => typeof v === 'string' && v.trim().length > 0,
        message: 'Phone cannot be empty',
      },
    },

    // Hidden by default; login explicitly selects it
    password: { type: String, required: true, minlength: 6, select: false },

    // UPDATED: role uses shared constants, with normalization
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.CUSTOMER,
      index: true,
      set: normalizeRole,
    },

    // NEW: agentType (PICKUP/DELIVERY) only meaningful when role === AGENT
    agentType: {
      type: String,
      default: null,
      validate: {
        validator: validateAgentType,
        message: ({ value }) =>
          `agentType must be one of: ${Object.values(AGENT_TYPES).join(', ')} (got '${value}')`,
      },
    },

    addresses: { type: [addressSchema], default: [] },

    // Optional extra metadata for agents
    agentProfile: { type: agentProfileSchema, default: undefined },

    // Email verification flow
    emailVerified: { type: Boolean, default: false },
    emailVerifyToken: { type: String },    // sha256(token)
    emailVerifyExpires: { type: Date },

    // Login backoff/lockout
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },

    // Password reset state (set by forgot-password, cleared after reset)
    passwordReset: {
      tokenHash: { type: String }, // sha256(token)
      expiresAt: { type: Date },   // expiry timestamp
    },

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
        delete ret.passwordReset;
        delete ret.emailVerifyToken;
        delete ret.emailVerifyExpires;
        return ret;
      },
    },
  }
);

/**
 * Indexes
 *  - Partial unique on phone => enforces uniqueness only for non-empty strings
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
