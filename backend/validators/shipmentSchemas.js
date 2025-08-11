// backend/validators/shipmentSchemas.js
import { z } from 'zod';
import * as AF from '../utils/afghanistan.js';
import { BOX_PRESETS } from '../utils/boxPresets.js';

/* ----------------------------- Provinces ----------------------------- */
const PROVINCES = AF.AFGHAN_PROVINCES ?? AF.AF_PROVINCES;
if (!Array.isArray(PROVINCES) || PROVINCES.length !== 34) {
  throw new Error('Afghanistan provinces list missing or invalid in utils/afghanistan.js');
}
const PROVINCES_SET = new Set(PROVINCES.map((p) => p.toLowerCase()));
const CANON = Object.fromEntries(PROVINCES.map((p) => [p.toLowerCase(), p]));

/* ------------------------------ Helpers ------------------------------ */
export const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const trim = (s) => (typeof s === 'string' ? s.trim() : s);
const asNumber = (v) => {
  if (v === '' || v === null || typeof v === 'undefined') return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  return undefined;
};
const asInt = (v) => { const n = asNumber(v); return Number.isFinite(n) ? Math.trunc(n) : undefined; };
const toCanonicalProvince = (s) => {
  const t = trim(s); if (!t) return t;
  const key = String(t).toLowerCase();
  return CANON[key] ?? t;
};
const isValidProvince = (s) => !!s && PROVINCES_SET.has(String(s).toLowerCase());

/* ------------------------------ Statuses ----------------------------- */
export const ShipmentStatusValues = [
  'CREATED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'AT_ORIGIN_HUB',
  'IN_TRANSIT',
  'AT_DESTINATION_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'ON_HOLD',
  'RETURN_TO_SENDER',
  'CANCELLED',
];
const STATUS_SET = new Set(ShipmentStatusValues);
export const shipmentStatusSchema = z.enum(ShipmentStatusValues);

// Allowed transitions
const StatusTransitions = {
  CREATED: ['PICKUP_SCHEDULED', 'CANCELLED'],
  PICKUP_SCHEDULED: ['PICKED_UP', 'ON_HOLD', 'CANCELLED'],
  PICKED_UP: ['AT_ORIGIN_HUB', 'ON_HOLD', 'RETURN_TO_SENDER'],
  AT_ORIGIN_HUB: ['IN_TRANSIT', 'ON_HOLD', 'RETURN_TO_SENDER'],
  IN_TRANSIT: ['AT_DESTINATION_HUB', 'ON_HOLD', 'RETURN_TO_SENDER'],
  AT_DESTINATION_HUB: ['OUT_FOR_DELIVERY', 'ON_HOLD', 'RETURN_TO_SENDER'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'ON_HOLD', 'RETURN_TO_SENDER'],
  DELIVERED: [],
  ON_HOLD: ['PICKED_UP','AT_ORIGIN_HUB','IN_TRANSIT','AT_DESTINATION_HUB','OUT_FOR_DELIVERY','CANCELLED','RETURN_TO_SENDER'],
  RETURN_TO_SENDER: ['AT_ORIGIN_HUB','OUT_FOR_DELIVERY','DELIVERED'],
  CANCELLED: [],
};
export function validateStatusTransition(from, to) {
  const allowed = StatusTransitions[from] || [];
  return allowed.includes(to);
}
export function assertTransition(currentStatus, nextStatus) {
  if (!validateStatusTransition(currentStatus, nextStatus)) {
    const allowed = StatusTransitions[currentStatus] || [];
    throw new Error(`Invalid status transition from ${currentStatus} to ${nextStatus}. Allowed: ${allowed.join(', ')}`);
  }
}

/* --------------------------- Common Schemas --------------------------- */
export const shipmentIdParams = z.object({ id: z.string().regex(OBJECT_ID_RE, 'Invalid id') });
export const idParamSchema = shipmentIdParams;

export const trackingIdParamSchema = z.object({
  trackingId: z.string().min(6).max(100).transform(trim),
});

export const listShipmentsQuery = z.object({
  page: z.preprocess(asInt, z.number().int().positive().max(1000)).optional(),
  limit: z.preprocess(asInt, z.number().int().positive().max(100)).optional(),
  status: z.string().transform((s) => (s ? String(s).trim().toUpperCase() : s))
    .refine((s) => !s || STATUS_SET.has(s), 'Invalid status')
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().max(120).transform(trim).optional(), // harmless filter if you still pass it
}).optional();

export const cancelShipmentBody = z.object({
  reason: z.string().max(200).transform(trim).optional(),
});

export const updateStatusBody = z.object({
  status: shipmentStatusSchema,
  reason: z.string().max(1000).transform(trim).optional(),
  notes: z.string().max(2000).transform(trim).optional(),
});

/* ----------------------- Addresses & Box selection ---------------------- */
const structuredAddress = z.object({
  name: z.string().min(1).max(120).transform(trim),
  phone: z.string().min(3).max(40).transform(trim),
  line1: z.string().min(1).max(240).transform(trim),
  line2: z.string().max(240).transform(trim).optional(),
  district: z.string().max(120).transform(trim).optional(),
  city: z.string().min(1).max(120).transform(trim),
  province: z.string().min(1).max(40).transform(toCanonicalProvince),
  postalCode: z.string().max(20).transform(trim).optional(),
  note: z.string().max(240).transform(trim).optional(),
});

const PRESET_CODES = Object.keys(BOX_PRESETS).map((k) => Number(k));

const boxTypeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('PRESET'),
    code: z.preprocess(asInt, z.number().int().positive())
      .refine((c) => PRESET_CODES.includes(c), { message: `code must be one of: ${PRESET_CODES.join(', ')}` }),
  }),
  z.object({
    kind: z.literal('CUSTOM'),
    length: z.preprocess(asNumber, z.number().positive()),
    width: z.preprocess(asNumber, z.number().positive()),
    height: z.preprocess(asNumber, z.number().positive()),
  }),
]);

/* --------------------------- Create Shipment --------------------------- */
export const createShipmentBody = z.object({
  // server can generate if omitted
  invoiceNumber: z.string().max(60).transform(trim).optional(),
  trackingId: z.string().max(60).transform(trim).optional(),

  // actors
  sender: z.string().regex(OBJECT_ID_RE, 'Invalid sender').optional(),

  // addresses (required)
  pickupAddress: structuredAddress,
  deliveryAddress: structuredAddress,

  // box (required)
  boxType: boxTypeSchema,

  // weighting & pricing knobs
  weightKg: z.preprocess(asNumber, z.number().min(0)).optional(),
  volumetricDivisor: z.preprocess(asInt, z.number().int().positive()).optional(),

  isCOD: z.preprocess(
    (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined),
    z.boolean().optional()
  ),
  codAmount: z.preprocess(asNumber, z.number().min(0)).optional(),

  payment: z.object({
    mode: z.enum(['PICKUP', 'DELIVERY']).optional(),
    method: z.enum(['CASH', 'ONLINE']).optional(),
    status: z.enum(['UNPAID', 'PAID']).optional(),
    transactionId: z.string().max(120).transform(trim).optional(),
  }).optional(),

  notes: z.string().max(2000).transform(trim).optional(),
}).superRefine((o, ctx) => {
  if (!isValidProvince(o.pickupAddress?.province)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pickupAddress', 'province'], message: 'pickupAddress.province must be an Afghanistan province' });
  } else {
    o.pickupAddress.province = toCanonicalProvince(o.pickupAddress.province);
  }
  if (!isValidProvince(o.deliveryAddress?.province)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryAddress', 'province'], message: 'deliveryAddress.province must be an Afghanistan province' });
  } else {
    o.deliveryAddress.province = toCanonicalProvince(o.deliveryAddress.province);
  }
});

/* --------------------------- Assign Agent body --------------------------- */
export const assignAgentBody = z.object({
  stage: z.enum(['PICKUP','DELIVERY']),
  agentId: z.string().regex(OBJECT_ID_RE, 'Invalid agentId'),
});

/* --------------------------- Live location push --------------------------- */
export const pushLocationBody = z.object({
  shipmentId: z.string().regex(OBJECT_ID_RE, 'Invalid shipmentId'),
  lat: z.preprocess(asNumber, z.number().min(-90).max(90)),
  lng: z.preprocess(asNumber, z.number().min(-180).max(180)),
  addressText: z.string().max(240).transform(trim).optional(),
});

/* ------------------------------ Admin reprice ------------------------------ */
export const adminRepriceSchema = z.object({
  pricingVersion: z.string().regex(OBJECT_ID_RE, 'Invalid pricingVersion').optional(),
  otherCharges: z.preprocess(asNumber, z.number().min(0)).optional(),
});
