// backend/routes/trackingRoutes.js
import express from 'express';
import { protect, isAgent } from '../middleware/authMiddleware.js';
import {
  updateShipmentLocation,
  updateLiveLocation,
  getLiveTracking,
  getCurrentShipmentLocation,
} from '../controllers/trackingController.js';

const router = express.Router();

// Agent updates shipment location (by shipmentId in URL)
router.post('/:shipmentId/update-location', protect, isAgent, updateShipmentLocation);

// Agent updates location (shipmentId in body)
router.post('/update', protect, isAgent, updateLiveLocation);

// Get live tracking logs (admin or shipment owner via protect middleware logic)
router.get('/:shipmentId', protect, getLiveTracking);

// Get current shipment location
router.get('/:shipmentId/current-location', protect, getCurrentShipmentLocation);

export default router;
