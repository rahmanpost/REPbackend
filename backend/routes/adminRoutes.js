import express from 'express';
import { protect,isAdmin } from '../middleware/authMiddleware.js';
import { createOrUpdatePricing, getAllPricing, getPricingByRoute,deletePricing } from '../controllers/adminController.js';
import { assignAgentToShipment } from '../controllers/adminController.js';
import {
  getAllUsers,
  getUserById,
  updateUserRole,
  deleteUserById,
} from '../controllers/adminUserController.js'; // we'll create this file next

import {
  createAgent,
  getAllAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
} from '../controllers/adminAgentController.js';


import {
  getAllShipments,
  getShipmentById,
  updateShipmentStatus,
} from '../controllers/adminController.js';

import { getDashboardStats } from '../controllers/adminController.js';


const router = express.Router();

// Admin creates or updates a price
router.post('/pricing', protect, isAdmin, createOrUpdatePricing);

// Admin fetches all pricing data
router.get('/pricing/all', protect, isAdmin, getAllPricing);

// Admin fetches price for a specific route
router.get('/pricing/:fromProvince/:toProvince', protect, isAdmin, getPricingByRoute);

// Admin deletes a pricing entry
router.delete('/pricing/:fromProvince/:toProvince', protect, isAdmin, deletePricing);




// ✅ Now protected
router.get('/shipments', protect, isAdmin, getAllShipments);
router.get('/shipments/:id', protect, isAdmin, getShipmentById);
router.put('/shipments/:id/status', protect, isAdmin, updateShipmentStatus);

// 🔐 Add below shipment routes

// Agent Management
router
  .route('/agents')
  .post(protect, isAdmin, createAgent)
  .get(protect, isAdmin, getAllAgents);

router
  .route('/agents/:id')
  .get(protect, isAdmin, getAgentById)
  .put(protect, isAdmin, updateAgent)
  .delete(protect, isAdmin, deleteAgent);



// GET all users
router.get('/users', protect, isAdmin, getAllUsers);

// GET user by ID
router.get('/users/:id', protect, isAdmin, getUserById);

// PUT update user role
router.put('/users/:id/role', protect, isAdmin, updateUserRole);

// DELETE user by ID
router.delete('/users/:id', protect, isAdmin, deleteUserById);
// PUT assign agent to shipment
// router.put('/shipments/:id/assign', assignAgentToShipment);

router.put('/shipments/:id/assign-agent', protect, isAdmin, assignAgentToShipment);

// 📊 GET /api/admin/dashboard
router.get('/dashboard', protect, isAdmin, getDashboardStats);

export default router;