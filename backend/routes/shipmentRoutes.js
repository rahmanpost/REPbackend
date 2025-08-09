// backend/routes/shipmentRoutes.js
import express from 'express';
import { protect, isAgent } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

import {
  createShipment,
  getMyShipments,
  cancelShipment,
  getShipmentByIdForUser,
  uploadShipmentFiles,
} from '../controllers/shipmentController.js';

import { downloadInvoice } from '../controllers/invoiceController.js';

const router = express.Router();

/**
 * User shipment CRUD
 */
router.post('/shipments', protect, createShipment);
router.get('/shipments/my', protect, getMyShipments);
router.get('/shipments/:id', protect, getShipmentByIdForUser);
router.delete('/shipments/:id', protect, cancelShipment);

/**
 * Agent uploads shipment-related files/photos
 * Fields supported: beforePhoto, afterPhoto, receipt
 */
router.put(
  '/shipments/:id/files',
  protect,
  isAgent,
  upload.fields([
    { name: 'beforePhoto', maxCount: 1 },
    { name: 'afterPhoto', maxCount: 1 },
    { name: 'receipt', maxCount: 1 },
  ]),
  uploadShipmentFiles
);

/**
 * Invoice download (kept both paths for backward compatibility)
 */
router.get('/shipments/:id/invoice', protect, downloadInvoice);
router.get('/:id/invoice', protect, downloadInvoice);

export default router;
