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
import { forgotPassword, resetPassword } from '../controllers/userController.js';

import {
  addAddress,
  updateAddress,
  deleteAddress,
} from '../controllers/addressController.js';
import { updateShipmentStatus } from '../controllers/shipmentController.js';
import { refreshAccessToken, logoutUser } from '../controllers/userController.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { requestEmailVerification, verifyEmail } from '../controllers/userController.js';





const router = express.Router();

//
// ✅ Public Routes
//
router.post('/login', loginUser);
router.post('/register', registerUser);


// Apply rate limiting to login and register routes
router.post('/login', authLimiter, loginUser);
router.post('/forgot', authLimiter, forgotPassword);
router.post('/reset/:token', authLimiter, resetPassword);

router.post('/verify/request', requestEmailVerification);
router.get('/verify/:token', verifyEmail);



// forgot password
router.post('/forgot', forgotPassword);
//reset password
router.post('/reset/:token', resetPassword);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logoutUser);


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

import { uploadProfilePicture } from '../controllers/userController.js';
import upload from '../middleware/uploadMiddleware.js';

router.put(
  '/upload-profile',
  protect,
  upload.single('profilePicture'),
  uploadProfilePicture
);

export default router;
