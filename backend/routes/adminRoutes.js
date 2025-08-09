// backend/routes/adminRoutes.js
import express from 'express';
import { protect, isAdmin } from '../middleware/authMiddleware.js';

// Pricing + dashboard + shipment admin ops live in adminController.js
import {
  createOrUpdatePricing,
  getAllPricing,
  getPricingByRoute,
  deletePricing,
  assignAgentToShipment,
  getAllShipments,
  getShipmentById,
  getDashboardStats,
} from '../controllers/adminController.js';

// Admin user management endpoints
import {
  getAllUsers,
  getUserById,
  updateUserRole,
  deleteUserById,
} from '../controllers/adminUserController.js';

// Admin agent management endpoints
import {
  createAgent,
  getAllAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
} from '../controllers/adminAgentController.js';

// New: pricing quote preview (admin GET) + shipment reprice
import { adminQuotePreview } from '../controllers/pricingController.js';
import { repriceShipment } from '../controllers/shipmentController.js';

const router = express.Router();

/**
 * Pricing management (Admin)
 */
router.post('/pricing', protect, isAdmin, createOrUpdatePricing);
router.get('/pricing', protect, isAdmin, getAllPricing);
router.get('/pricing/:fromProvince/:toProvince', protect, isAdmin, getPricingByRoute);
router.delete('/pricing/:fromProvince/:toProvince', protect, isAdmin, deletePricing);

// NEW: Admin GET quote preview using query params
// Example:
//   GET /api/admin/pricing/quote?weightKg=2.5&pieces=1&serviceType=EXPRESS&zoneName=DOMESTIC&isCOD=true&codAmount=2500&length=30&width=20&height=15
router.get('/pricing/quote', protect, isAdmin, adminQuotePreview);

/**
 * Shipments (Admin)
 */
router.get('/shipments', protect, isAdmin, getAllShipments);
router.get('/shipments/:id', protect, isAdmin, getShipmentById);

// Assign agent to a shipment
router.put('/assign-agent', protect, isAdmin, assignAgentToShipment);

// NEW: Recompute charges for a shipment using current active pricing
router.patch('/shipments/:id/reprice', protect, isAdmin, repriceShipment);

/**
 * Users (Admin)
 */
router.get('/users', protect, isAdmin, getAllUsers);
router.get('/users/:id', protect, isAdmin, getUserById);
router.put('/users/:id/role', protect, isAdmin, updateUserRole);
router.delete('/users/:id', protect, isAdmin, deleteUserById);

/**
 * Agents (Admin)
 */
router.post('/agents', protect, isAdmin, createAgent);
router.get('/agents', protect, isAdmin, getAllAgents);
router.get('/agents/:id', protect, isAdmin, getAgentById);
router.put('/agents/:id', protect, isAdmin, updateAgent);
router.delete('/agents/:id', protect, isAdmin, deleteAgent);

/**
 * Dashboard (Admin)
 */
router.get('/dashboard', protect, isAdmin, getDashboardStats);

export default router;
