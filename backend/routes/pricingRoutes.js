import express from 'express';
import { getPrice } from '../controllers/pricingController.js';

const router = express.Router();

// Public can check price with query: /api/pricing?from=...&to=...
router.get('/', getPrice);

export default router;
