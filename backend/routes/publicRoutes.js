// backend/routes/publicRoutes.js
import express from 'express';
import { validate } from '../middleware/validate.js';
import { trackingIdParamSchema } from '../validators/shipmentSchemas.js';
import { publicTrack } from '../controllers/shipments/publicTrack.js';
import { getQuote } from '../controllers/pricingController.js';

const router = express.Router();

// Public pricing quotes (active pricing only). Supports GET query or POST body.
router.get('/pricing/quote', getQuote);
router.post('/pricing/quote', getQuote);

// Public tracking by trackingId (non-PII)
router.get('/track/:trackingId', validate(trackingIdParamSchema, 'params'), publicTrack);

export default router;
