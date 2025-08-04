import express from 'express';
import { protect } from '../middleware/authMiddleware.js';

import { 
  createShipment,
  getMyShipments,
  cancelShipment,
  getShipmentByIdForUser
} from '../controllers/shipmentController.js';
import {
  uploadShipmentFiles,
} from '../controllers/shipmentController.js';

import upload from '../middleware/uploadMiddleware.js';
import { isAgent } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createShipment);
router.get('/my', protect, getMyShipments);
router.get('/my-shipments', protect, getMyShipments);    // changed from '/' to '/my-shipments'
router.put('/:id/cancel', protect, cancelShipment);
router.get('/:id', protect, getShipmentByIdForUser);
router.put(
  '/:id/upload',
  protect,
  isAgent,
  upload.fields([
    { name: 'beforePhoto', maxCount: 1 },
    { name: 'afterPhoto', maxCount: 1 },
    { name: 'receipt', maxCount: 1 },
  ]),
  uploadShipmentFiles
);


export default router;
