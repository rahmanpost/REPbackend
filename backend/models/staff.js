// backend/models/staff.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

/* ------------------------- enums & small helpers ------------------------- */
export const StaffRoleValues = [
  'AGENT',        // field agent / counter staff
  'DRIVER',
  'ACCOUNTANT',
  'DISPATCHER',
  'OPERATIONS',
  'ADMIN',        // app admin
  'SUPER_ADMIN',  // owner-level
];

export const StaffStatusValues = ['ACTIVE', 'ON_LEAVE', 'TERMINATED'];
export const PayScheduleValues = ['MONTHLY'];
export const PaymentMethodValues = ['CASH', 'ONLINE', 'BANK'];

function stripCtl(s) {
  return typeof s === 'string'
    ? s.replace(/[\u0000-\u001F\u007F]/g, '').trim()
    : s;
}
function clampNonNeg(n) {
  const x = Number(n);
  return Number.isFinite(x) && x >= 0 ? x : 0;
}
function normalizePhone(s) {
  if (!s) return s;
  const cleaned = String(s).replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

/* ------------------------------ bank schema ----------------------------- */
const bankSchema = new Schema(
  {
    bankName: { type: String, trim: true },
    accountName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    iban: { type: String, trim: true },
    swift: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

/* -------------------------------- model -------------------------------- */
const staffSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },

    // Human-friendly unique code (e.g., REP-00123). We store uppercase for uniqueness.
    employeeCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
      unique: true,
      index: true,
    },

    phone: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },

    role: { type: String, enum: StaffRoleValues, default: 'AGENT', index: true },
    status: { type: String, enum: StaffStatusValues, default: 'ACTIVE', index: true },

    // Compensation
    baseSalary: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, default: 'AFN', maxlength: 6 },
    paySchedule: { type: String, enum: PayScheduleValues, default: 'MONTHLY' },
    paymentMethod: { type: String, enum: PaymentMethodValues, default: 'CASH' },
    bank: { type: bankSchema, default: undefined },

    // Employment dates
    joinDate: { type: Date, required: true, default: Date.now },
    endDate: { type: Date, default: null },

    // Optional link to app user
    linkedUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Misc
    notes: { type: String, trim: true, maxlength: 2000 },

    meta: {
      lastManualEditAt: { type: Date },
    },
  },
  { timestamps: true }
);

/* ---------------------------- pre-validate guard ---------------------------- */
staffSchema.pre('validate', function (next) {
  try {
    // Basic sanitization: strip control chars + trim
    this.fullName = stripCtl(this.fullName).slice(0, 120);
    this.employeeCode = stripCtl(this.employeeCode).slice(0, 40);
    this.phone = normalizePhone(stripCtl(this.phone)).slice(0, 40);
    if (this.email) this.email = stripCtl(this.email).toLowerCase().slice(0, 160);
    if (this.currency) this.currency = stripCtl(this.currency).toUpperCase().slice(0, 6);
    if (this.notes) this.notes = stripCtl(this.notes).slice(0, 2000);

    // Bank fields (if present)
    if (this.bank) {
      this.bank.bankName = stripCtl(this.bank.bankName);
      this.bank.accountName = stripCtl(this.bank.accountName);
      this.bank.accountNumber = stripCtl(this.bank.accountNumber);
      this.bank.iban = stripCtl(this.bank.iban);
      this.bank.swift = stripCtl(this.bank.swift);
      this.bank.notes = stripCtl(this.bank.notes);
    }

    // Clamp numeric values
    this.baseSalary = clampNonNeg(this.baseSalary);

    // Dates sanity: ensure endDate is not before joinDate
    if (this.endDate && this.joinDate && this.endDate < this.joinDate) {
      // keep data safe by nulling invalid endDate
      this.endDate = null;
    }

    next();
  } catch (e) {
    next(e);
  }
});

/* -------------------------------- indexes -------------------------------- */
staffSchema.index({ createdAt: -1 });
staffSchema.index({ role: 1, status: 1 });


const Staff = mongoose.model('Staff', staffSchema);
export default Staff;
