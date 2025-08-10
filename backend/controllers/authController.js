// backend/controllers/authController.js
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/mailer.js';


// in authController.js (top)
async function safeEmail(promise, label='email'){
  try { return await promise; } 
  catch(e){ console.error(`[mailer] ${label} failed:`, e?.response || e?.message || e); return null; }
}

/** ------------------------
 * Config & tiny utilities
 * ---------------------- */
const {
  JWT_SECRET,
  JWT_EXPIRE = '7d',
  EMAIL_VERIFICATION_REQUIRED = 'true', // set to 'false' to skip email verify gating on login
} = process.env;

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
}

function buildAbsoluteUrl(req, relativePathWithQuery) {
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host')).split(',')[0].trim();
  return `${proto}://${host}${relativePathWithQuery}`;
}

// Progressive backoff config
const MAX_ATTEMPTS = 5;
const BASE_LOCK_MINUTES = 15;

/** Compute next lockout based on attempts */
function computeLockUntil(attempts) {
  // Exponential backoff: 15m, 30m, 60m, cap at 24h
  const minutes = Math.min(BASE_LOCK_MINUTES * Math.pow(2, Math.max(0, attempts - MAX_ATTEMPTS)), 24 * 60);
  return new Date(Date.now() + minutes * 60 * 1000);
}

function isLocked(user) {
  return user.lockUntil && user.lockUntil > new Date();
}

/** Hash a token for DB storage */
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Generate a random token (returned raw), and hashed version + expiry for DB */
function genTokenPair(expMinutes = 60) {
  const raw = crypto.randomBytes(32).toString('hex');
  const hashed = hashToken(raw);
  const expires = new Date(Date.now() + expMinutes * 60 * 1000);
  return { raw, hashed, expires };
}

/** ------------------------
 * Auth Controllers
 * ---------------------- */

/**
 * @route  POST /api/auth/register
 * @access Public
 */
export const register = asyncHandler(async (req, res) => {
  const { fullName, name, phone, email, password } = req.body || {};
  // Zod already validated, but double-check
  if ((!fullName && !name) || !phone || !email || !password) {
    return res.status(400).json({ success: false, message: 'fullName/name, phone, email, and password are required' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email already registered' });
  }

  const user = await User.create({
    fullName: fullName || name,      // ← map name → fullName
    phone,                            // ← required by your model
    email: email.toLowerCase(),
    password,                         // assume pre-save hook hashes
    emailVerified: false,
    loginAttempts: 0,
    lockUntil: null,
  });

  if (EMAIL_VERIFICATION_REQUIRED === 'true') {
    const { raw, hashed, expires } = genTokenPair(60 * 24); // 24h
    user.emailVerifyToken = hashed;
    user.emailVerifyExpires = expires;
    await user.save({ validateBeforeSave: false });

    const verifyUrl = buildAbsoluteUrl(req, `/api/auth/verify-email?token=${encodeURIComponent(raw)}`);
    await safeEmail(sendVerificationEmail({ to: user.email, verifyUrl }), 'verification');

  }

  const token = signToken(user);
  return res.status(201).json({
    success: true,
    message: 'Registered successfully',
    data: {
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    },
  });
});


/**
 * @route  POST /api/auth/login
 * @access Public
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password +loginAttempts +lockUntil');
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (isLocked(user)) {
    return res.status(423).json({ success: false, message: 'Account temporarily locked. Try again later.' });
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    user.loginAttempts = (user.loginAttempts || 0) + 1;

    if (user.loginAttempts >= MAX_ATTEMPTS) {
      user.lockUntil = computeLockUntil(user.loginAttempts);
      user.loginAttempts = 0; // reset counter after locking
    }

    await user.save({ validateBeforeSave: false });
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  // Success: reset attempts & lock
  user.loginAttempts = 0;
  user.lockUntil = null;

  // Require verified email if configured
  if (EMAIL_VERIFICATION_REQUIRED === 'true' && !user.emailVerified) {
    // Keep the UX smooth: if no token or expired, refresh a new one automatically
    const needNew = !user.emailVerifyToken || !user.emailVerifyExpires || user.emailVerifyExpires < new Date();
    if (needNew) {
      const { raw, hashed, expires } = genTokenPair(60 * 24);
      user.emailVerifyToken = hashed;
      user.emailVerifyExpires = expires;
      const verifyUrl = buildAbsoluteUrl(req, `/api/auth/verify-email?token=${encodeURIComponent(raw)}`);
      await sendVerificationEmail({ to: user.email, verifyUrl });
    }
    await user.save({ validateBeforeSave: false });
    return res.status(403).json({ success: false, message: 'Email not verified. Verification link sent to your email.' });
  }

  await user.save({ validateBeforeSave: false });
  const token = signToken(user);
  res.json({
    success: true,
    message: 'Logged in',
    data: {
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    },
  });
});

/**
 * @route  POST /api/auth/forgot-password
 * @access Public
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Do not reveal whether an account exists
    return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  }

  const { raw, hashed, expires } = genTokenPair(60); // 60 minutes
  user.resetPasswordToken = hashed;
  user.resetPasswordExpires = expires;
  await user.save({ validateBeforeSave: false });

  const resetUrl = buildAbsoluteUrl(req, `/api/auth/reset-password?token=${encodeURIComponent(raw)}`);
  await sendPasswordResetEmail({ to: user.email, resetUrl });

  res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
});

/**
 * @route  POST /api/auth/reset-password
 * @access Public
 * @body   { token, password }
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ success: false, message: 'Token and new password are required' });
  }

  const hashed = hashToken(token);
  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpires: { $gt: new Date() },
  }).select('+password');

  if (!user) {
    return res.status(400).json({ success: false, message: 'Reset token is invalid or has expired' });
  }

  user.password = password; // assume pre-save hook hashes
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;

  // Also clear login lock if any
  user.loginAttempts = 0;
  user.lockUntil = null;

  await user.save();
  res.json({ success: true, message: 'Password has been reset successfully' });
});

/**
 * @route  GET /api/auth/verify-email
 * @access Public
 * @query  token
 */
export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query || {};
  if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

  const hashed = hashToken(token);
  const user = await User.findOne({
    emailVerifyToken: hashed,
    emailVerifyExpires: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({ success: false, message: 'Verification token is invalid or has expired' });
  }

  user.emailVerified = true;
  user.emailVerifyToken = undefined;
  user.emailVerifyExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, message: 'Email verified successfully' });
});

/**
 * @route  POST /api/auth/resend-verification
 * @access Private (or Public if you prefer)
 */
export const resendVerification = asyncHandler(async (req, res) => {
  const email = (req.body?.email || req.user?.email || '').toLowerCase();
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.emailVerified) {
    return res.json({ success: true, message: 'Email already verified' });
  }

  const { raw, hashed, expires } = genTokenPair(60 * 24);
  user.emailVerifyToken = hashed;
  user.emailVerifyExpires = expires;
  await user.save({ validateBeforeSave: false });

  const verifyUrl = buildAbsoluteUrl(req, `/api/auth/verify-email?token=${encodeURIComponent(raw)}`);
  await sendVerificationEmail({ to: user.email, verifyUrl });

  res.json({ success: true, message: 'Verification link sent' });
});

/**
 * @route  GET /api/auth/me
 * @access Private
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json({ success: true, data: user });
});

/**
 * @route  POST /api/auth/logout
 * @access Private
 * (JWT logout is typically client-side; this is just a stub)
 */
export const logout = asyncHandler(async (_req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

/** Back-compat aliases (keep existing routes working) */
export const registerUser = register;
export const loginUser = login;
