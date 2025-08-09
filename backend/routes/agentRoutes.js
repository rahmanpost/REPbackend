// backend/routes/agentRoutes.js
import express from 'express';
import { protect, isAgent } from '../middleware/authMiddleware.js';

// All agent operations
import {
  getAssignedShipments,
  getMyDeliveries,
  updateShipmentProgress,
  confirmPickup,
  confirmDelivery,
  updateDeliveryStatus,
  markShipmentPickedUp,
  markDeliveryAttempt,
  markReturnStatus,
  markAsReturning,
} from '../controllers/agentController.js';

const router = express.Router();

// 📦 List shipments assigned to the logged-in agent
// GET /api/agent/shipments
router.get('/shipments', protect, isAgent, getAssignedShipments);

// 📦 List deliveries for the logged-in agent
// GET /api/agent/deliveries
router.get('/deliveries', protect, isAgent, getMyDeliveries);

// 🔄 Generic progress update
// PUT /api/agent/shipments/:id/progress
router.put('/shipments/:id/progress', protect, isAgent, updateShipmentProgress);

// ✅ Confirm pickup
// PUT /api/agent/shipments/:id/confirm-pickup
router.put('/shipments/:id/confirm-pickup', protect, isAgent, confirmPickup);

// ✅ Confirm delivery
// PUT /api/agent/shipments/:id/confirm-delivery
router.put('/shipments/:id/confirm-delivery', protect, isAgent, confirmDelivery);

// 📝 Update delivery status (custom status text/state)
// PUT /api/agent/shipments/:id/delivery-status
router.put('/shipments/:id/delivery-status', protect, isAgent, updateDeliveryStatus);

// ✅ Mark picked up (alt to confirmPickup if your controller supports both)
// PUT /api/agent/shipments/:id/picked-up
router.put('/shipments/:id/picked-up', protect, isAgent, markShipmentPickedUp);

// 🚚 Record delivery attempt
// PUT /api/agent/shipments/:id/delivery-attempt
router.put('/shipments/:id/delivery-attempt', protect, isAgent, markDeliveryAttempt);

// ↩️ Mark return status
// PUT /api/agent/shipments/:id/return-status
router.put('/shipments/:id/return-status', protect, isAgent, markReturnStatus);

// ↩️ Mark as returning
// PUT /api/agent/shipments/:id/return
router.put('/shipments/:id/return', protect, isAgent, markAsReturning);

export default router;
