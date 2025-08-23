import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';

import financeSummary from '../../controllers/admin/metrics/financeSummary.js';
import financeMonthly from '../../controllers/admin/metrics/financeMonthly.js';

const router = express.Router();

// Only auth here; controllers do requireAdmin internally
router.use(protect);

// GET /api/admin/metrics/finance/summary
router.get('/finance/summary', financeSummary);

// GET /api/admin/metrics/finance/monthly
router.get('/finance/monthly', financeMonthly);

export default router;
