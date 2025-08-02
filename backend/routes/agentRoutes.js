import express from 'express';
import { protect } from '../controllers/userController.js';
import { isAgent } from '../middleware/agentMiddleware.js';
import {
  getAssignedShipments,
  updateShipmentProgress,
} from '../controllers/agentController.js';
import { confirmPickup } from '../controllers/agentController.js';
import { confirmDelivery } from '../controllers/agentController.js';
import { updateDeliveryStatus } from '../controllers/agentController.js';
import { markShipmentPickedUp } from '../controllers/agentController.js';
import { markDeliveryAttempt } from '../controllers/agentController.js';
import { markReturnStatus } from '../controllers/agentController.js';
import { markAsReturning } from '../controllers/agentController.js';








const router = express.Router();

// 🧑‍💼 Agent gets their assigned shipments
router.get('/shipments', protect, isAgent, getAssignedShipments);

// 🚚 Agent updates shipment status
router.put('/shipments/:id/status', protect, isAgent, updateShipmentProgress);

// 🚚 Agent confirms pickup of a shipment
router.put('/shipments/:id/pickup', protect, isAgent, confirmPickup);

// 🚚 Agent confirms delivery of a shipment
router.put('/shipments/:id/deliver', protect, isAgent, confirmDelivery);

// 🚚 Agent updates delivery status
router.put('/shipments/:id/deliver', protect, isAgent, updateDeliveryStatus);

// 🚚 Agent marks shipment as picked up
router.put('/shipments/:id/pickup', protect, isAgent, markShipmentPickedUp);

// 🚚 Agent marks delivery attempt
router.put('/shipments/:id/delivery-attempt', protect, isAgent, markDeliveryAttempt);

// 🚚 Agent marks return status
router.put('/shipments/:id/return-status', protect, isAgent, markReturnStatus);

// 🚚 Agent marks shipment as returning
// PUT /api/agent/shipments/:id/return
router.put('/shipments/:id/return', protect, isAgent, markAsReturning);


export default router;
