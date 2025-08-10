// backend/validators/publicSchemas.js
import { z } from 'zod';
import { toNumber } from './common.js';

export const publicTrackQuery = z.object({
  trackingId: z.string().trim().min(3),
});

export const publicQuoteBody = z
  .object({
    fromCity: z.string().trim().optional(),
    fromCountry: z.string().trim().optional(),
    toCity: z.string().trim().optional(),
    toCountry: z.string().trim(),
    weight: z.preprocess(toNumber, z.number().positive()),
    length: z.preprocess(toNumber, z.number().nonnegative()).optional(),
    width: z.preprocess(toNumber, z.number().nonnegative()).optional(),
    height: z.preprocess(toNumber, z.number().nonnegative()).optional(),
    volumetricDivisor: z.preprocess(toNumber, z.number().positive()).optional(),
    detailed: z.union([z.boolean(), z.enum(['1', 'true'])]).optional(),
  })
  .passthrough();
