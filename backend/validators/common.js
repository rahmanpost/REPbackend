// backend/validators/common.js
import { z } from 'zod';

export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid Mongo ObjectId');

export const email = z.string().trim().toLowerCase().email();

export const nonEmptyString = z.string().trim().min(1);
export const optionalString = z.string().trim().max(2000).optional();

export const currency3 = z.string().regex(/^[A-Z]{3}$/, 'Currency must be 3-letter ISO code').optional();

export const toNumber = (v) =>
  typeof v === 'string' && v.trim() !== '' ? Number(v) : v;

export const number = z.preprocess(toNumber, z.number());
export const nonNegativeNumber = z.preprocess(toNumber, z.number().nonnegative());
export const positiveNumber = z.preprocess(toNumber, z.number().positive());

export const boolish = z
  .union([z.boolean(), z.enum(['1', '0', 'true', 'false', 'yes', 'no', 'on', 'off'])])
  .transform((v) => {
    const s = String(v).toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(s);
  });

export const paginationQuery = z.object({
  page: z.preprocess(toNumber, z.number().int().min(1)).optional(),
  limit: z.preprocess(toNumber, z.number().int().min(1).max(200)).optional(),
  sort: z.string().optional(),
  q: z.string().optional(),
});

export const roleEnum = z.enum(['ADMIN', 'AGENT', 'CUSTOMER']);

// Update to match your Shipment model if it differs:
export const statusEnum = z.enum([
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
  'EXCEPTION',
  'ON_HOLD',
]);
