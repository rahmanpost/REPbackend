// backend/routes/invoiceRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { downloadInvoice, generateInvoice } from '../controllers/invoiceController.js';

const router = express.Router();

// Generate (if your controller supports on-demand generation)
router.get('/:id/generate', protect, generateInvoice);

// Download existing invoice PDF
router.get('/:id/download', protect, downloadInvoice);

export default router;
