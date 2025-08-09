// backend/routes/pricingRoutes.js
import express from 'express';
import { protect, isAdmin, isAgent } from '../middleware/authMiddleware.js';
import {
  createPricing, listPricing, getPricing, updatePricing, deletePricing,
  getActivePricing, getQuote
} from '../controllers/pricingController.js';

const router = express.Router();

// Admin management
router.post('/', protect, isAdmin, createPricing);
router.get('/', protect, isAdmin, listPricing);
router.get('/:id', protect, isAdmin, getPricing);
router.put('/:id', protect, isAdmin, updatePricing);
router.delete('/:id', protect, isAdmin, deletePricing);

// Public/Agent/Customer access
router.get('/active/current', protect, getActivePricing);
router.post('/quote', protect, getQuote); // user/agent can request quotes

export default router;
