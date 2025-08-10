// backend/validators/shipmentSchemas.js
import { z } from 'zod';
// Be resilient to either AFGHAN_PROVINCES or AF_PROVINCES being exported.
import * as AF from '../utils/afghanistan.js';

/* ----------------------------- Province support ----------------------------- */
const PROVINCES = AF.AFGHAN_PROVINCES ?? AF.AF_PROVINCES;
if (!Array.isArray(PROVINCES) || PROVINCES.length !== 34) {
  throw new Error('Afghanistan provinces list missing or invalid in utils/afghanistan.js');
}
const PROVINCES_SET = new Set(PROVINCES.map((p) => p.toLowerCase()));
const CANON = Object.fromEntries(PROVINCES.map((p) => [p.toLowerCase(), p]));

/* --------------------------------- Helpers --------------------------------- */
export const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

const trim = (s) => (typeof s === 'string' ? s.trim() : s);
const upper = (s) => (typeof s === 'string' ? s.toUpperCase() : s);

// number-ish -> number (handles "", null)
const asNumber = (v) => {
  if (v === '' || v === null || typeof v === 'undefined') return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
// number-ish -> int
const asInt = (v) => {
  const n = asNumber(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

// case-insensitive province → canonical name (or unchanged if not matched)
const toCanonicalProvince = (s) => {
  const t = trim(s);
  if (!t) return t;
  const key = t.toLowerCase();
  return CANON[key] ?? t;
};

/* ----------------------------- Reusable pieces ------------------------------ */

// Accept partial endpoint objects (we’ll enforce required province after transform)
const endpointPartial = z.object({
  name: z.string().max(120).transform(trim).optional(),
  phone: z.string().max(40).transform(trim).optional(),
  email: z.string().max(120).transform(trim).optional(),
  address: z.string().max(240).transform(trim).optional(),
  city: z.string().max(120).transform(trim).optional(),
  // Province optional here; we validate & require it after transform
  province: z.string().max(40).transform(toCanonicalProvince).optional(),
}).partial();

// Path params: :id must be ObjectId
export const shipmentIdParams = z.object({
  id: z.string().regex(OBJECT_ID_RE, 'Invalid id'),
});

// Query for /mine (pagination & filters)
export const listShipmentsQuery = z.object({
  page: z.preprocess(asInt, z.number().int().positive().max(1000)).optional(),
  limit: z.preprocess(asInt, z.number().int().positive().max(100)).optional(),
  q: z.string().max(120).transform(trim).optional(),
  status: z
    .string()
    .max(40)
    .transform(upper)
    .refine((s) => !s || [
      'CREATED','PICKED_UP','IN_TRANSIT','ARRIVED','OUT_FOR_DELIVERY',
      'DELIVERED','RETURNED','CANCELLED','HOLD'
    ].includes(s), 'Invalid status')
    .optional(),
  dateFrom: z.string().max(40).transform(trim).optional(),
  dateTo: z.string().max(40).transform(trim).optional(),
});

// Cancel body
export const cancelShipmentBody = z.object({
  reason: z.string().max(200).transform(trim).optional(),
});

// Update status body (admin/agent)
export const updateStatusBody = z.object({
  status: z
    .string()
    .max(40)
    .transform(upper)
    .refine((s) => [
      'CREATED','PICKED_UP','IN_TRANSIT','ARRIVED','OUT_FOR_DELIVERY',
      'DELIVERED','RETURNED','CANCELLED','HOLD'
    ].includes(s), 'Invalid status'),
  notes: z.string().max(2000).transform(trim).optional(),
});

// Assign agent body
export const assignAgentBody = z.object({
  agentId: z.string().regex(OBJECT_ID_RE, 'Invalid agentId'),
});

/* -------------------------- Create (Afghanistan-only) ----------------------- */
/**
 * Accepts flat and/or nested fields and transforms to:
 * {
 *   sender, agent, invoiceNumber, serviceType, zoneName,
 *   from, to, items, weightKg, pieces, declaredValue, isCOD, codAmount,
 *   dimensionsCm, notes
 * }
 * Provinces are REQUIRED and must be one of the 34 Afghanistan provinces.
 */
const SERVICE_TYPES = ['EXPRESS', 'ECONOMY', 'STANDARD'];

const itemSchema = z.object({
  description: z.string().max(200).transform(trim).optional(),
  qty: z.preprocess(asInt, z.number().int().positive()).optional(),
  unitPrice: z.preprocess(asNumber, z.number().nonnegative()).optional(),
});

export const createShipmentBody = z
  .object({
    // required by controller
    invoiceNumber: z.string().max(60).transform(trim),

    // optional overrides
    sender: z.string().regex(OBJECT_ID_RE, 'Invalid sender').optional(),
    agent: z.string().regex(OBJECT_ID_RE, 'Invalid agent').optional(),

    // pricing
    serviceType: z
      .string().max(30)
      .transform(upper)
      .refine((s) => !s || SERVICE_TYPES.includes(s), 'Invalid serviceType')
      .optional(),
    zoneName: z.string().max(40).transform(trim).optional(),

    weightKg: z.preprocess(asNumber, z.number().positive()).optional(),
    pieces: z.preprocess(asInt, z.number().int().positive()).optional(),
    declaredValue: z.preprocess(asNumber, z.number().nonnegative()).optional(),
    isCOD: z.preprocess(
      (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined),
      z.boolean().optional()
    ),
    codAmount: z.preprocess(asNumber, z.number().nonnegative()).optional(),

    // dimensions (flat)
    lengthCm: z.preprocess(asNumber, z.number().positive()).optional(),
    widthCm: z.preprocess(asNumber, z.number().positive()).optional(),
    heightCm: z.preprocess(asNumber, z.number().positive()).optional(),

    // Either nested...
    from: endpointPartial.optional(),
    to: endpointPartial.optional(),
    // ...or flat
    fromName: z.string().max(120).transform(trim).optional(),
    fromPhone: z.string().max(40).transform(trim).optional(),
    fromEmail: z.string().max(120).transform(trim).optional(),
    fromAddress: z.string().max(240).transform(trim).optional(),
    fromCity: z.string().max(120).transform(trim).optional(),
    fromProvince: z.string().max(40).transform(toCanonicalProvince).optional(),

    toName: z.string().max(120).transform(trim).optional(),
    toPhone: z.string().max(40).transform(trim).optional(),
    toEmail: z.string().max(120).transform(trim).optional(),
    toAddress: z.string().max(240).transform(trim).optional(),
    toCity: z.string().max(120).transform(trim).optional(),
    toProvince: z.string().max(40).transform(toCanonicalProvince).optional(),

    notes: z.string().max(2000).transform(trim).optional(),
    items: z.array(itemSchema).optional(),
  })
  .transform((v) => {
    // Merge nested with flat fields
    const from = {
      ...(v.from || {}),
      name: v.from?.name ?? v.fromName ?? undefined,
      phone: v.from?.phone ?? v.fromPhone ?? undefined,
      email: v.from?.email ?? v.fromEmail ?? undefined,
      address: v.from?.address ?? v.fromAddress ?? undefined,
      city: v.from?.city ?? v.fromCity ?? undefined,
      province: v.from?.province ?? v.fromProvince ?? undefined,
    };
    const to = {
      ...(v.to || {}),
      name: v.to?.name ?? v.toName ?? undefined,
      phone: v.to?.phone ?? v.toPhone ?? undefined,
      email: v.to?.email ?? v.toEmail ?? undefined,
      address: v.to?.address ?? v.toAddress ?? undefined,
      city: v.to?.city ?? v.toCity ?? undefined,
      province: v.to?.province ?? v.toProvince ?? undefined,
    };

    const dimensionsCm =
      v.lengthCm || v.widthCm || v.heightCm
        ? {
            length: v.lengthCm || undefined,
            width: v.widthCm || undefined,
            height: v.heightCm || undefined,
          }
        : undefined;

    return {
      sender: v.sender,
      agent: v.agent,
      invoiceNumber: v.invoiceNumber,
      serviceType: v.serviceType || 'EXPRESS',
      zoneName: v.zoneName,
      from,
      to,
      items: v.items,
      weightKg: v.weightKg,
      pieces: v.pieces,
      declaredValue: v.declaredValue,
      isCOD: v.isCOD === true,
      codAmount: v.codAmount,
      dimensionsCm,
      notes: v.notes,
    };
  })
  .superRefine((o, ctx) => {
    // Require provinces and validate against the canonical list (case-insensitive)
    if (!o.from || !o.from.province) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from', 'province'], message: 'from.province is required (Afghanistan only).' });
    } else if (!PROVINCES_SET.has(String(o.from.province).toLowerCase())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from', 'province'], message: 'Invalid from.province' });
    } else {
      // normalize to canonical casing
      o.from.province = CANON[String(o.from.province).toLowerCase()];
    }

    if (!o.to || !o.to.province) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to', 'province'], message: 'to.province is required (Afghanistan only).' });
    } else if (!PROVINCES_SET.has(String(o.to.province).toLowerCase())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to', 'province'], message: 'Invalid to.province' });
    } else {
      o.to.province = CANON[String(o.to.province).toLowerCase()];
    }
  });
