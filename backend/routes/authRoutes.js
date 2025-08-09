import express from 'express';
import { authLimiter } from '../middleware/rateLimiter.js';
import { protect } from '../middleware/authMiddleware.js';
import {
  register,
  login,
  verifyEmail,
  me,
} from '../controllers/authController.js';
import { forgotPassword, resetPassword } from '../controllers/authController.js';


const router = express.Router();

// Register & Login (rate-limited)
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);

// Optional email verification
router.post('/verify-email', verifyEmail);

// Who am I
router.get('/me', protect, me);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);


export default router;

