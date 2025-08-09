// backend/routes/publicRoutes.js
import express from 'express';
import { trackShipment } from '../controllers/publicController.js';
import { getAllPricing, getPricingByRoute } from '../controllers/adminController.js';

const router = express.Router();

// Public tracking by trackingId
router.get('/:trackingId', trackShipment);

// Public pricing endpoints (read-only)
router.get('/pricing', getAllPricing);
router.get('/pricing/:fromProvince/:toProvince', getPricingByRoute);

export default router;
