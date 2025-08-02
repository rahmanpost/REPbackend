import { protect } from '../middleware/authMiddleware.js';
import express from 'express';
import { 
  createShipment,
  getMyShipments,
  cancelShipment,
  getShipmentByIdForUser
} from '../controllers/shipmentController.js';

const router = express.Router();

router.post('/', protect, createShipment);
router.get('/my-shipments', protect, getMyShipments);    // changed from '/' to '/my-shipments'
router.put('/:id/cancel', protect, cancelShipment);
router.get('/:id', protect, getShipmentByIdForUser);

export default router;
