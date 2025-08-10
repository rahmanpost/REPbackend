// backend/validators/pricingSchemas.js
import { z } from 'zod';
import { objectId, nonNegativeNumber, positiveNumber, currency3 } from './common.js';

export const pricingIdParams = z.object({ id: objectId });

/** Pricing document (ADMIN) — keep permissive; adjust to your Pricing model */
export const pricingDocBody = z
  .object({
    version: z.string().trim().min(1).optional(),
    active: z.boolean().optional(),
    currency: currency3, // e.g., "AFN", "USD"
    volumetricDivisor: positiveNumber.optional(), // default 5000 if omitted

    baseRate: nonNegativeNumber.optional(),
    perKgRate: nonNegativeNumber.optional(),

    // Optional: zones, surcharges, etc.
    zones: z
      .array(
        z.object({
          name: z.string().trim(),
          countryCodes: z.array(z.string().trim().length(2)).optional(),
          baseRate: nonNegativeNumber.optional(),
          perKgRate: nonNegativeNumber.optional(),
        })
      )
      .optional(),

    surcharges: z
      .array(
        z.object({
          code: z.string().trim(),
          label: z.string().trim().optional(),
          amount: nonNegativeNumber.optional(),
          percent: nonNegativeNumber.optional(),
        })
      )
      .optional(),
  })
  .passthrough();

/** Activate a pricing version (ADMIN) */
export const setActivePricingBody = z.object({
  active: z.boolean(),
});

/** Reprice endpoints */
export const repriceParams = z.object({ id: objectId });

// GET /admin/shipments/:id/reprice/preview?version=...
export const repricePreviewQuery = z.object({
  version: z.string().trim().optional(),
});

// PATCH /admin/shipments/:id/reprice  (server computes totals; we allow optional note)
export const repricePatchBody = z.object({
  comment: z.string().trim().max(500).optional(),
});
