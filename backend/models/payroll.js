// backend/models/payroll.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/* ------------------------- small helpers ------------------------- */
function stripCtl(s) {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001F\u007F]/g, '').trim() : s;
}
function clampNonNeg(n) {
  const x = Number(n);
  return Number.isFinite(x) && x >= 0 ? x : 0;
}

/* ---------------------------- file schema ---------------------------- */
const fileSchema = new Schema(
  {
    path: { type: String, required: true },
    filename: { type: String, required: true },
    mimetype: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

/* --------------------------- allowance/deduction --------------------------- */
const moneyRowSchema = new Schema(
  {
    label: { type: String, trim: true, maxlength: 60 },
    amount: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

/* -------------------------------- schema -------------------------------- */
const payrollSchema = new Schema(
  {
    staff: { type: Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },

    periodYear: { type: Number, min: 2000, max: 2100, required: true },
    periodMonth: { type: Number, min: 1, max: 12, required: true },

    grossSalary: { type: Number, min: 0, default: 0 },
    allowances: { type: [moneyRowSchema], default: [] },
    deductions: { type: [moneyRowSchema], default: [] },
    overtimeAmount: { type: Number, min: 0, default: 0 },
    bonusAmount: { type: Number, min: 0, default: 0 },

    netPay: { type: Number, min: 0, default: 0 }, // derived

    currency: { type: String, default: 'AFN', maxlength: 6 },

    status: {
      type: String,
      enum: ['DRAFT', 'APPROVED', 'PAID'],
      default: 'DRAFT',
      index: true,
    },

    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paidAt: { type: Date, default: null },
    txnRef: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 2000 },

    attachments: {
      payslipPdf: { type: fileSchema, default: null },
    },

    meta: { lastManualEditAt: { type: Date } },
  },
  { timestamps: true }
);

/* ---------------------------- sanitization hooks ---------------------------- */
payrollSchema.pre('validate', function (next) {
  try {
    this.currency = stripCtl(this.currency || 'AFN').toUpperCase().slice(0, 6);
    this.txnRef = this.txnRef ? stripCtl(this.txnRef).slice(0, 120) : this.txnRef;
    this.notes = this.notes ? stripCtl(this.notes).slice(0, 2000) : this.notes;

    this.grossSalary = clampNonNeg(this.grossSalary);
    this.overtimeAmount = clampNonNeg(this.overtimeAmount);
    this.bonusAmount = clampNonNeg(this.bonusAmount);

    this.allowances = Array.isArray(this.allowances)
      ? this.allowances.slice(0, 50).map((r) => ({
          label: stripCtl(r?.label || '').slice(0, 60),
          amount: clampNonNeg(r?.amount),
        }))
      : [];
    this.deductions = Array.isArray(this.deductions)
      ? this.deductions.slice(0, 50).map((r) => ({
          label: stripCtl(r?.label || '').slice(0, 60),
          amount: clampNonNeg(r?.amount),
        }))
      : [];

    next();
  } catch (e) {
    next(e);
  }
});

payrollSchema.pre('save', function (next) {
  try {
    const a = (this.allowances || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const d = (this.deductions || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const net = Math.max(
      0,
      (Number(this.grossSalary) || 0) + (Number(this.overtimeAmount) || 0) + (Number(this.bonusAmount) || 0) + a - d
    );
    this.netPay = Math.round(net * 100) / 100;
    next();
  } catch (e) {
    next(e);
  }
});

/* -------------------------------- indexes -------------------------------- */
payrollSchema.index({ createdAt: -1 });
payrollSchema.index({ staff: 1, periodYear: 1, periodMonth: 1 }, { unique: true }); // one record per staff per month
payrollSchema.index({ status: 1, periodYear: 1, periodMonth: 1 });

const Payroll = mongoose.model('Payroll', payrollSchema);
export default Payroll;
