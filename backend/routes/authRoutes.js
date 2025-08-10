// backend/routes/authRoutes.js
import express from 'express';
import {
  register, login, getMe, logout,
  forgotPassword, resetPassword,
  verifyEmail, resendVerification,
  // Back-compat aliases if you still mount them elsewhere:
  registerUser, loginUser,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendVerificationSchema,
  verifyEmailQuerySchema,
} from '../validators/authSchemas.js';

const router = express.Router();

router.post('/register', validate(registerSchema), register);   // or registerUser alias
router.post('/login', validate(loginSchema), login);            // or loginUser alias
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.get('/verify-email', validate(verifyEmailQuerySchema, 'query'), verifyEmail);
router.post('/resend-verification', validate(resendVerificationSchema), resendVerification);

export default router;
