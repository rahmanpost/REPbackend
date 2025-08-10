// backend/validators/trackingSchemas.js
import { z } from 'zod';
import { objectId, statusEnum, optionalString } from './common.js';

export const trackingIdParams = z.object({ id: objectId });

export const addTrackingLogBody = z.object({
  status: statusEnum,
  location: optionalString,
  details: optionalString,
  timestamp: z.preprocess((v) => (v ? new Date(v) : v), z.date()).optional(),
});
