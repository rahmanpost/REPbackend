// backend/validators/metricsSchemas.js
import { z } from 'zod';

const strip = (s) => (typeof s === 'string' ? s.trim() : s);
const asInt = (v) => {
  if (v === '' || v === null || typeof v === 'undefined') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};
const asBool = (v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined);

export const rangeQuery = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    tz: z.string().max(40).transform(strip).default('Asia/Kabul').optional(),
    months: z.preprocess(asInt, z.number().int().min(1).max(36)).optional(),
    includeApproved: z.preprocess(asBool, z.boolean().optional()),
  })
  .optional();
