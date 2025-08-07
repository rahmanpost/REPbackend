import express from 'express';
import { downloadInvoice, generateInvoice } from '../controllers/invoiceController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/:id/generate', protect, generateInvoice);
router.get('/:id/download', protect, downloadInvoice);

export default router;
