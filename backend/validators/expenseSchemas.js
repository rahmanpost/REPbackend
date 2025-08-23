// backend/validators/expenseSchemas.js
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
export const ExpenseCategories = [
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
];
export const ExpenseStatusValues = ['DRAFT', 'APPROVED', 'PAID'];
export const PaymentMethodValues = ['CASH', 'ONLINE', 'BANK'];

/* ------------------------------ params & query ------------------------------ */
export const expenseIdParams = z.object({
  id: z.string().regex(OBJECT_ID_RE, 'Invalid expense id'),
});

export const listExpensesQuery = z
  .object({
    page: z.preprocess(asInt, z.number().int().positive().max(1000)).optional(),
    limit: z.preprocess(asInt, z.number().int().positive().max(100)).optional(),
    category: z
      .string()
      .transform((s) => (s ? s.trim().toUpperCase() : s))
      .refine((s) => !s || ExpenseCategories.includes(s), 'Invalid category')
      .optional(),
    status: z
      .string()
      .transform((s) => (s ? s.trim().toUpperCase() : s))
      .refine((s) => !s || ExpenseStatusValues.includes(s), 'Invalid status')
      .optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    q: z.string().max(160).transform((s) => stripCtl(s)).optional(),
    tag: z.string().max(40).transform((s) => stripCtl(s)).optional(),
  })
  .optional();

/* ------------------------------ bodies ------------------------------ */
export const createExpenseBody = z
  .object({
    date: z.coerce.date(),
    category: z.enum(ExpenseCategories),
    amount: z.preprocess(asNumber, z.number().min(0)),
    currency: z.string().max(6).transform((s) => stripCtl(s).toUpperCase()).default('AFN').optional(),

    description: z.string().max(1000).transform((s) => sanitizeText(s, 1000)).optional(),
    vendor: z.string().max(240).transform((s) => sanitizeText(s, 240)).optional(),
    invoiceNumber: z.string().max(120).transform((s) => sanitizeText(s, 120)).optional(),

    paidVia: z.enum(PaymentMethodValues).default('CASH').optional(),
    notes: z.string().max(240).transform((s) => sanitizeText(s, 240)).optional(),
    tags: z.array(z.string().max(40).transform((s) => stripCtl(s))).max(30).optional(),
  })
  .strict();

export const updateExpenseBody = z
  .object({
    date: z.coerce.date().optional(),
    category: z.enum(ExpenseCategories).optional(),
    amount: z.preprocess(asNumber, z.number().min(0)).optional(),
    currency: z.string().max(6).transform((s) => stripCtl(s).toUpperCase()).optional(),

    description: z.string().max(1000).transform((s) => sanitizeText(s, 1000)).optional(),
    vendor: z.string().max(240).transform((s) => sanitizeText(s, 240)).optional(),
    invoiceNumber: z.string().max(120).transform((s) => sanitizeText(s, 120)).optional(),

    paidVia: z.enum(PaymentMethodValues).optional(),
    notes: z.string().max(240).transform((s) => sanitizeText(s, 240)).optional(),
    tags: z.array(z.string().max(40).transform((s) => stripCtl(s))).max(30).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

export const approveExpenseBody = z
  .object({
    notes: z.string().max(240).transform((s) => sanitizeText(s, 240)).optional(),
  })
  .strict();

export const payExpenseBody = z
  .object({
    paidAt: z.coerce.date().optional(),
    paidVia: z.enum(PaymentMethodValues),
    txnRef: z.string().min(2).max(120).transform((s) => stripCtl(s)).optional(),
  })
  .strict();
