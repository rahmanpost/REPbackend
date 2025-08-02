import express from 'express';
import { protect, isAdmin, isAgent } from '../middleware/authMiddleware.js';
import {
  registerUser,
  loginUser,
  getUserById,
  getAllUsers,
  deleteUser,
  getUserProfile,
  updateUserProfile,
  setDefaultAddress,
} from '../controllers/userController.js';
import {
  addAddress,
  updateAddress,
  deleteAddress,
} from '../controllers/addressController.js';
import { updateShipmentStatus } from '../controllers/shipmentController.js';

const router = express.Router();

//
// ✅ Public Routes
//
router.post('/login', loginUser);
router.post('/register', registerUser);

//
// 🔐 Protected Routes (Logged-in user required)
//
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);

router.post('/addresses', protect, addAddress);
router.put('/addresses/:addrId', protect, updateAddress);
router.delete('/addresses/:addrId', protect, deleteAddress);
router.patch('/addresses/:index/default', protect, setDefaultAddress);

//
// 🔒 Admin-only Routes
//
router.get('/', protect, isAdmin, getAllUsers);
router.get('/:id', protect, isAdmin, getUserById);
router.delete('/:id', protect, isAdmin, deleteUser);

//
// 🚚 Agent Route
//
router.put('/shipments/:id/update-status', isAgent, updateShipmentStatus);

export default router;
