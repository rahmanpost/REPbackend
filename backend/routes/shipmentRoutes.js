// backend/routes/shipmentRoutes.js
import express from 'express';
import { protect, isAgent } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';

import {
  createShipment,
  getMyShipments,
  cancelShipment,
  getShipmentByIdForUser,
  uploadShipmentFiles,
  updateShipmentStatus,
  assignAgent, // ← NEW
  updateShipmentLocation,
} from '../controllers/shipments/index.js';

import {
  createShipmentBody,
  shipmentIdParams,
  cancelShipmentBody,
  updateStatusBody,
  listShipmentsQuery,
  assignAgentBody, // ← NEW
  pushLocationBody,
} from '../validators/shipmentSchemas.js';

import { downloadInvoice } from '../controllers/invoiceController.js';

const router = express.Router();

/** Create (Afghanistan-only; Zod transforms flat → nested) */
router.post('/', protect, validate(createShipmentBody), createShipment);

/** Mine & list */
router.get('/mine', protect, validate(listShipmentsQuery, 'query'), getMyShipments);

/** Cancel (soft) */
router.post(
  '/:id/cancel',
  protect,
  validate(shipmentIdParams, 'params'),
  validate(cancelShipmentBody),
  cancelShipment
);
router.patch(
  '/:id/cancel',
  protect,
  validate(shipmentIdParams, 'params'),
  validate(cancelShipmentBody),
  cancelShipment
);

// Legacy DELETE still performs soft cancel (kept for compatibility)
router.delete(
  '/:id',
  protect,
  validate(shipmentIdParams, 'params'),
  validate(cancelShipmentBody),
  cancelShipment
);

/** Update status (Admin/Agent) */
router.patch(
  '/:id/status',
  protect,
  isAgent,
  validate(shipmentIdParams, 'params'),
  validate(updateStatusBody),
  updateShipmentStatus
);

/** Assign agent (Admin/Agent) */
router.patch(
  '/:id/assign-agent',
  protect,
  isAgent,
  validate(shipmentIdParams, 'params'),
  validate(assignAgentBody),
  assignAgent
);

/** Upload files (Admin/Agent) */
router.put(
  '/:id/files',
  protect,
  isAgent,
  validate(shipmentIdParams, 'params'),
  upload.fields([
    { name: 'beforePhoto', maxCount: 1 },
    { name: 'afterPhoto', maxCount: 1 },
    { name: 'receipt', maxCount: 1 },
  ]),
  uploadShipmentFiles
);

/** Invoice download (back-compat) */
router.get('/:id/invoice', protect, validate(shipmentIdParams, 'params'), downloadInvoice);

/** By id (keep last so specific routes above take precedence) */
router.get('/:id', protect, validate(shipmentIdParams, 'params'), getShipmentByIdForUser);

router.patch(
  '/:id/location',
  protect,
  isAgent,
  validate(shipmentIdParams, 'params'),
  validate(pushLocationBody),
  updateShipmentLocation
);

export default router;
