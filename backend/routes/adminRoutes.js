// backend/routes/adminRoutes.js
import express from 'express';
import { protect, isAdmin } from '../middleware/authMiddleware.js';

// --- keep your existing admin controllers for users/agents/dashboard ---
import {
  assignAgentToShipment,   // if you still use this standalone endpoint
  getAllShipments,
  getShipmentById,
  getDashboardStats,
} from '../controllers/adminController.js';

import {
  getAllUsers,
  getUserById,
  updateUserRole,
  deleteUserById,
} from '../controllers/adminUserController.js';

import {
  createAgent,
  getAllAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
} from '../controllers/adminAgentController.js';

// --- NEW: use upgraded pricing controller ---
import {
  createPricing,
  listPricing,
  getPricing as getPricingById,   // alias exported by controller
  updatePricing,
  deletePricing,
  getActivePricing,
  setActivePricing,
  adminQuotePreview,              // GET /api/admin/pricing/quote
} from '../controllers/pricingController.js';

// --- NEW: shipment repricing (preview/apply) ---
import {
  previewReprice,
  repriceShipment,
} from '../controllers/shipments/reprice.js';

const router = express.Router();

/**
 * Pricing (Admin)
 * Replaces legacy createOrUpdatePricing/getPricingByRoute etc.
 */
router.post('/pricing', protect, isAdmin, createPricing);
router.get('/pricing', protect, isAdmin, listPricing);
router.get('/pricing/active', protect, isAdmin, getActivePricing);
router.get('/pricing/:id', protect, isAdmin, getPricingById);
router.patch('/pricing/:id', protect, isAdmin, updatePricing);
router.patch('/pricing/:id/activate', protect, isAdmin, setActivePricing);
router.delete('/pricing/:id', protect, isAdmin, deletePricing);

// Admin quote preview (uses active pricing unless you pass pricingVersion in body)
router.get('/pricing/quote', protect, isAdmin, adminQuotePreview);

/**
 * Shipments (Admin)
 */
router.get('/shipments', protect, isAdmin, getAllShipments);
router.get('/shipments/:id', protect, isAdmin, getShipmentById);

// Optional: if you still want a separate admin assign-agent endpoint
router.put('/assign-agent', protect, isAdmin, assignAgentToShipment);

// Repricing: preview + apply
router.get('/shipments/:id/reprice/preview', protect, isAdmin, previewReprice);
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
