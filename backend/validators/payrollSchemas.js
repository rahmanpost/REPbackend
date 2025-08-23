// backend/validators/payrollSchemas.js
import { z } from 'zod';

/* ------------------------------ helpers ------------------------------ */
export const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const stripCtl = (s) =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001F\u007F]/g, '').trim() : s;

const sanitizeText = (s, max = 2000) => {
  if (typeof s !== 'string') return s;
  return s.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
};

const asNumber = (v) => {
  if (v === '' || v === null || typeof v === 'undefined') return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
const asInt = (v) => {
  const n = asNumber(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

/* ------------------------------ enums ------------------------------ */
export const PayrollStatusValues = ['DRAFT', 'APPROVED', 'PAID'];
export const PaymentMethodValues = ['CASH', 'ONLINE', 'BANK'];

/* ------------------------------ rows ------------------------------ */
const moneyRow = z.object({
  label: z.string().min(1).max(60).transform((s) => stripCtl(s)),
  amount: z.preprocess(asNumber, z.number().min(0)),
});

/* ------------------------------ params & query ------------------------------ */
export const payrollIdParams = z.object({
  id: z.string().regex(OBJECT_ID_RE, 'Invalid payroll id'),
});

export const listPayrollQuery = z
  .object({
    page: z.preprocess(asInt, z.number().int().positive().max(1000)).optional(),
    limit: z.preprocess(asInt, z.number().int().positive().max(100)).optional(),
    staff: z.string().regex(OBJECT_ID_RE, 'Invalid staff').optional(),
    status: z
      .string()
      .transform((s) => (s ? s.toUpperCase().trim() : s))
      .refine((s) => !s || PayrollStatusValues.includes(s), 'Invalid status')
      .optional(),
    year: z.preprocess(asInt, z.number().int().min(2000).max(2100)).optional(),
    month: z.preprocess(asInt, z.number().int().min(1).max(12)).optional(),
    from: z.coerce.date().optional(), // optional: filter by (year-month) >= from
    to: z.coerce.date().optional(),   // optional: filter by (year-month) <= to
  })
  .optional();

/* ------------------------------ bodies ------------------------------ */
export const createPayrollBody = z
  .object({
    staff: z.string().regex(OBJECT_ID_RE, 'Invalid staff'),
    periodYear: z.preprocess(asInt, z.number().int().min(2000).max(2100)),
    periodMonth: z.preprocess(asInt, z.number().int().min(1).max(12)),

    grossSalary: z.preprocess(asNumber, z.number().min(0)).default(0).optional(),
    allowances: z.array(moneyRow).max(50).optional(),
    deductions: z.array(moneyRow).max(50).optional(),
    overtimeAmount: z.preprocess(asNumber, z.number().min(0)).default(0).optional(),
    bonusAmount: z.preprocess(asNumber, z.number().min(0)).default(0).optional(),

    currency: z
      .string()
      .max(6)
      .transform((s) => stripCtl(s).toUpperCase())
      .default('AFN')
      .optional(),

    notes: z.string().max(2000).transform((s) => sanitizeText(s, 2000)).optional(),
  })
  .strict();

export const updatePayrollBody = z
  .object({
    grossSalary: z.preprocess(asNumber, z.number().min(0)).optional(),
    allowances: z.array(moneyRow).max(50).optional(),
    deductions: z.array(moneyRow).max(50).optional(),
    overtimeAmount: z.preprocess(asNumber, z.number().min(0)).optional(),
    bonusAmount: z.preprocess(asNumber, z.number().min(0)).optional(),
    currency: z.string().max(6).transform((s) => stripCtl(s).toUpperCase()).optional(),
    notes: z.string().max(2000).transform((s) => sanitizeText(s, 2000)).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

export const approvePayrollBody = z
  .object({
    notes: z.string().max(240).transform((s) => sanitizeText(s, 240)).optional(),
  })
  .strict();

export const payPayrollBody = z
  .object({
    paidAt: z.coerce.date().optional(),
    txnRef: z.string().min(2).max(120).transform((s) => stripCtl(s)),
    method: z.enum(PaymentMethodValues).default('CASH').optional(),
  })
  .strict();
