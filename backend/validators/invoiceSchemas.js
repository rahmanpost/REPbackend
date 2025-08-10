// backend/validators/invoiceSchemas.js
import { z } from 'zod';

export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid Mongo ObjectId');

export const invoiceIdParams = z.object({
  id: objectId,
});

// For GET /:id/generate?email=1|true|yes|someone@example.com
export const generateInvoiceQuery = z.object({
  email: z
    .union([
      z.literal('1'),
      z.literal('true'),
      z.literal('yes'),
      z.string().email(),
    ])
    .optional(),
});

// For POST /:id/email  (body)
export const emailInvoiceBody = z.object({
  email: z.string().email().optional(), // optional: will auto-detect if not provided
});
