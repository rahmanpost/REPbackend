// backend/routes/publicRoutes.js
import express from 'express';
import { trackShipment } from '../controllers/publicController.js';
import { getAllPricing, getPricingByRoute } from '../controllers/adminController.js';


const router = express.Router();

router.get('/:trackingId', trackShipment);
router.get('/pricing', getAllPricing);
router.get('/pricing/:fromProvince/:toProvince', getPricingByRoute);

export default router;
