// backend/routes/pricingRoutes.js
import express from 'express';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';
import {
  createPricing,
  listPricing,
  getPricing,
  updatePricing,
  deletePricing,
  getActivePricing,
  getQuote,
} from '../controllers/pricingController.js';

const router = express.Router();

/**
 * Public/Agent/Customer access (must be BEFORE '/:id' to avoid conflicts on GET)
 * These require a signed-in user (protect), but not admin.
 */
router.get('/active', protect, getActivePricing);   // GET /api/admin/pricing/active
router.post('/quote', protect, getQuote);           // POST /api/admin/pricing/quote

/**
 * Admin management
 */
router.post('/', protect, requireAdmin, createPricing);
router.get('/', protect, requireAdmin, listPricing);
router.get('/:id', protect, requireAdmin, getPricing);
router.put('/:id', protect, requireAdmin, updatePricing);
router.delete('/:id', protect, requireAdmin, deletePricing);

export default router;
