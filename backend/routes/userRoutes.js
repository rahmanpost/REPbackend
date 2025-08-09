// backend/routes/userRoutes.js
import express from 'express';
import { protect, isAdmin, isAgent } from '../middleware/authMiddleware.js';

// Auth endpoints (moved to dedicated controller)
import {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';

// User/profile/address endpoints remain in userController
import {
  getUserById,
  getAllUsers,
  deleteUser,
  getUserProfile,
  updateUserProfile,
  setDefaultAddress,
  addAddress,
  uploadProfilePicture,
} from '../controllers/userController.js';

// Agent-related shipment status update
import { updateShipmentStatus } from '../controllers/shipmentController.js';

// Upload (profile picture)
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

/**
 * Auth
 */
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

/**
 * Current user profile
 */
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);

/**
 * Addresses
 */
router.post('/addresses', protect, addAddress);
router.put('/addresses/default/:addressId', protect, setDefaultAddress);

/**
 * Admin user management
 */
router.get('/', protect, isAdmin, getAllUsers);
router.get('/:id', protect, isAdmin, getUserById);
router.delete('/:id', protect, isAdmin, deleteUser);

/**
 * Upload profile picture
 */
router.put(
  '/upload-profile',
  protect,
  upload.single('profilePicture'),
  uploadProfilePicture
);

/**
 * Agent shipment operations (if you expose through /api/users)
 */
router.put('/shipments/:id/update-status', protect, isAgent, updateShipmentStatus);

export default router;
