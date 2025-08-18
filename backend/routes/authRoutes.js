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
  resetPasswordSchema,          // expects { token, password }
  resendVerificationSchema,
  verifyEmailQuerySchema,       // expects ?token=...
} from '../validators/authSchemas.js';

const router = express.Router();

/**
 * Normalize body for password reset:
 * Accept { token, newPassword } or { token, password }.
 * We map newPassword -> password BEFORE validation.
 */
const normalizeResetBody = (req, _res, next) => {
  if (req.body && req.body.newPassword && !req.body.password) {
    req.body.password = req.body.newPassword;
  }
  next();
};


router.post('/register', validate(registerSchema), register);   // or registerUser alias

router.post('/login', validate(loginSchema), login);            // or loginUser alias
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);

/** Password reset (supports both paths + both body shapes) */
router.post('/reset-password', normalizeResetBody, validate(resetPasswordSchema), resetPassword);
router.post('/reset',          normalizeResetBody, validate(resetPasswordSchema), resetPassword);

/** Email verification */
router.get('/verify-email', validate(verifyEmailQuerySchema, 'query'), verifyEmail);

/** Resend verification */
router.post('/resend-verification', validate(resendVerificationSchema), resendVerification);

export default router;
