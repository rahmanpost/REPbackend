// backend/models/expense.js
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

/* -------------------------------- schema -------------------------------- */
const expenseSchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    category: {
      type: String,
      enum: [
        'RENT',
        'UTILITIES',
        'INTERNET',
        'FUEL',
        'SUPPLIES',
        'MAINTENANCE',
        'TRAVEL',
        'MARKETING',
        'SALARY_TOPUP',
        'MISC',
      ],
      required: true,
      index: true,
    },

    amount: { type: Number, min: 0, required: true },
    currency: { type: String, default: 'AFN', maxlength: 6 },

    description: { type: String, trim: true, maxlength: 1000 },
    vendor: { type: String, trim: true, maxlength: 240 },
    invoiceNumber: { type: String, trim: true, maxlength: 120 },

    paidVia: { type: String, enum: ['CASH', 'ONLINE', 'BANK'], default: 'CASH' },
    status: { type: String, enum: ['DRAFT', 'APPROVED', 'PAID'], default: 'DRAFT', index: true },

    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paidAt: { type: Date, default: null },
    txnRef: { type: String, trim: true, maxlength: 120 },

    tags: { type: [String], default: [] },

    attachments: { receipt: { type: fileSchema, default: null } },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    deleted: { type: Boolean, default: false }, // soft delete
    meta: { lastManualEditAt: { type: Date } },
  },
  { timestamps: true }
);

/* ---------------------------- sanitization hooks ---------------------------- */
expenseSchema.pre('validate', function (next) {
  try {
    this.currency = stripCtl(this.currency || 'AFN').toUpperCase().slice(0, 6);
    this.description = this.description ? stripCtl(this.description).slice(0, 1000) : this.description;
    this.vendor = this.vendor ? stripCtl(this.vendor).slice(0, 240) : this.vendor;
    this.invoiceNumber = this.invoiceNumber ? stripCtl(this.invoiceNumber).slice(0, 120) : this.invoiceNumber;
    this.txnRef = this.txnRef ? stripCtl(this.txnRef).slice(0, 120) : this.txnRef;

    this.amount = clampNonNeg(this.amount);

    this.tags = Array.isArray(this.tags)
      ? this.tags.slice(0, 30).map((t) => stripCtl(t).slice(0, 40)).filter(Boolean)
      : [];

    next();
  } catch (e) {
    next(e);
  }
});

/* -------------------------------- indexes -------------------------------- */
expenseSchema.index({ createdAt: -1 });
expenseSchema.index({ category: 1, date: -1 });
expenseSchema.index({ status: 1, date: -1 });
expenseSchema.index({ deleted: 1 });

const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
