// backend/validators/staffSchemas.js
import { z } from 'zod';

/* ------------------------------ Helpers ------------------------------ */
export const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const stripCtl = (s) =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001F\u007F]/g, '').trim() : s;

const trim = (s) => (typeof s === 'string' ? s.trim() : s);

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

const normalizePhone = (s) => {
  if (!s) return s;
  const cleaned = String(s).replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
};

/* ------------------------------ Enums ------------------------------ */
// Keep these in sync with backend/models/staff.js
export const StaffRoleValues = [
  'AGENT',
  'DRIVER',
  'ACCOUNTANT',
  'DISPATCHER',
  'OPERATIONS',
  'ADMIN',
  'SUPER_ADMIN',
];

export const StaffStatusValues = ['ACTIVE', 'ON_LEAVE', 'TERMINATED'];
export const PayScheduleValues = ['MONTHLY'];
export const PaymentMethodValues = ['CASH', 'ONLINE', 'BANK'];

/* --------------------------- Common Schemas --------------------------- */
export const staffIdParams = z.object({
  id: z.string().regex(OBJECT_ID_RE, 'Invalid staff id'),
});

export const listStaffQuery = z
  .object({
    page: z.preprocess(asInt, z.number().int().positive().max(1000)).optional(),
    limit: z.preprocess(asInt, z.number().int().positive().max(100)).optional(),
    role: z
      .string()
      .transform((s) => (s ? String(s).trim().toUpperCase() : s))
      .refine((s) => !s || StaffRoleValues.includes(s), 'Invalid role')
      .optional(),
    status: z
      .string()
      .transform((s) => (s ? String(s).trim().toUpperCase() : s))
      .refine((s) => !s || StaffStatusValues.includes(s), 'Invalid status')
      .optional(),
    q: z.string().max(160).transform(trim).optional(), // name/phone/email/code search
  })
  .optional();

/* ------------------------------ Bank block ------------------------------ */
const bankSchema = z
  .object({
    bankName: z.string().max(120).transform((v) => sanitizeText(v, 120)).optional(),
    accountName: z.string().max(120).transform((v) => sanitizeText(v, 120)).optional(),
    accountNumber: z.string().max(80).transform((v) => sanitizeText(v, 80)).optional(),
    iban: z.string().max(60).transform((v) => sanitizeText(v, 60)).optional(),
    swift: z.string().max(60).transform((v) => sanitizeText(v, 60)).optional(),
    notes: z.string().max(240).transform((v) => sanitizeText(v, 240)).optional(),
  })
  .strict()
  .optional();

/* --------------------------- Create / Update --------------------------- */
const employeeCodeSchema = z
  .string()
  .min(2, 'employeeCode is required')
  .max(40)
  .transform((s) => stripCtl(s))
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z0-9_-]+$/.test(s), 'employeeCode must contain only A–Z, 0–9, _ or -');

const phoneSchema = z
  .string()
  .min(3)
  .max(40)
  .transform((s) => stripCtl(s))
  .transform((s) => normalizePhone(s))
  .refine((s) => /^\+?\d{3,}$/.test(s), 'Invalid phone');

const emailOptSchema = z
  .string()
  .email('Invalid email')
  .max(160)
  .transform((s) => stripCtl(s).toLowerCase())
  .optional();

const currencyOptSchema = z
  .string()
  .max(6)
  .transform((s) => stripCtl(s).toUpperCase())
  .optional();

export const createStaffBody = z
  .object({
    fullName: z.string().min(1).max(120).transform((s) => sanitizeText(s, 120)),
    employeeCode: employeeCodeSchema,
    phone: phoneSchema,
    email: emailOptSchema,

    role: z.enum(StaffRoleValues).default('AGENT').optional(),
    status: z.enum(StaffStatusValues).default('ACTIVE').optional(),

    baseSalary: z.preprocess(asNumber, z.number().min(0)).default(0).optional(),
    currency: currencyOptSchema.default('AFN').optional(),
    paySchedule: z.enum(PayScheduleValues).default('MONTHLY').optional(),
    paymentMethod: z.enum(PaymentMethodValues).default('CASH').optional(),
    bank: bankSchema,

    joinDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),

    linkedUser: z.string().regex(OBJECT_ID_RE, 'Invalid linkedUser').optional(),

    notes: z.string().max(2000).transform((s) => sanitizeText(s, 2000)).optional(),
  })
  .strict()
  .superRefine((o, ctx) => {
    if (o.endDate && o.joinDate && o.endDate < o.joinDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate cannot be before joinDate',
      });
    }
  });

export const updateStaffBody = z
  .object({
    fullName: z.string().min(1).max(120).transform((s) => sanitizeText(s, 120)).optional(),
    employeeCode: employeeCodeSchema.optional(),
    phone: phoneSchema.optional(),
    email: emailOptSchema,

    role: z.enum(StaffRoleValues).optional(),
    status: z.enum(StaffStatusValues).optional(),

    baseSalary: z.preprocess(asNumber, z.number().min(0)).optional(),
    currency: currencyOptSchema,
    paySchedule: z.enum(PayScheduleValues).optional(),
    paymentMethod: z.enum(PaymentMethodValues).optional(),
    bank: bankSchema,

    joinDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),

    linkedUser: z.string().regex(OBJECT_ID_RE, 'Invalid linkedUser').optional(),

    notes: z.string().max(2000).transform((s) => sanitizeText(s, 2000)).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' })
  .superRefine((o, ctx) => {
    if (o.endDate && o.joinDate && o.endDate < o.joinDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate cannot be before joinDate',
      });
    }
  });

/* --------------------------- Status Change Only --------------------------- */
export const changeStatusBody = z.object({
  status: z.enum(StaffStatusValues),
  notes: z.string().max(240).transform((s) => sanitizeText(s, 240)).optional(),
});
