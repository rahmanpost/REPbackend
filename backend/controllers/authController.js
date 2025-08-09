// backend/controllers/authController.js
import asyncHandler from 'express-async-handler';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import User from '../models/User.js';
import LoginAttempt from '../models/LoginAttempt.js';
import VerificationToken from '../models/VerificationToken.js';
import PasswordResetToken from '../models/PasswordResetToken.js';

/** Helpers */
const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });

/** Lockout/backoff settings (beyond rate limiter) */
const MAX_ATTEMPTS = 5;            // attempts before temporary lock
const LOCK_MS      = 15 * 60_000;  // 15 minutes
const BACKOFF_MS   = [0, 5_000, 10_000, 20_000, 30_000]; // progressive waits (ms)

/** Normalize role checks */
const isElevated = (role) => ['ADMIN', 'AGENT'].includes(String(role || '').toUpperCase());

/** Load or create attempt record by email-ish key */
async function getAttempt(key) {
  let rec = await LoginAttempt.findOne({ key });
  if (!rec) rec = await LoginAttempt.create({ key, count: 0, lastAttempt: new Date(0) });
  return rec;
}

/** Compute remaining lock/backoff time (ms). Returns { waitMs, locked } */
function computeWait(attempt) {
  const now = Date.now();
  // Lock window
  if (attempt.lockUntil && attempt.lockUntil.getTime() > now) {
    return { waitMs: attempt.lockUntil.getTime() - now, locked: true };
  }
  // Soft backoff based on recent count
  const idx = Math.min(attempt.count, BACKOFF_MS.length - 1);
  const waitMs = BACKOFF_MS[idx] || 0;
  const since = now - (attempt.lastAttempt?.getTime() || 0);
  return { waitMs: Math.max(0, waitMs - since), locked: false };
}

/** Record a failed login and maybe set lockUntil */
async function recordFail(attempt) {
  attempt.count = (attempt.count || 0) + 1;
  attempt.lastAttempt = new Date();
  if (attempt.count >= MAX_ATTEMPTS) {
    attempt.lockUntil = new Date(Date.now() + LOCK_MS);
    attempt.count = 0; // reset after starting a lock window
  }
  await attempt.save();
}

/** Reset attempt state on success */
async function recordSuccess(attempt) {
  attempt.count = 0;
  attempt.lockUntil = undefined;
  attempt.lastAttempt = new Date();
  await attempt.save();
}

/** Generate base64url token */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** (Optional) issue email verification token */
async function issueVerificationToken(userId, ttlMinutes = 60 * 24) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await VerificationToken.create({ user: userId, token, expiresAt });
  return token;
}

/** POST /api/auth/register */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'name, email, and password are required.' });
  }

  const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email is already registered.' });
  }

  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(password, salt);

  const user = await User.create({
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    password: hashed,
    role: role && isElevated(role) ? role : 'USER',
  });

  // Optional: email verification hook (enable when you wire emailing)
  let verification = null;
  if (process.env.ENABLE_EMAIL_VERIFICATION === 'true') {
    const token = await issueVerificationToken(user._id);
    verification = {
      token,
      // Example link (adjust domain/route as you like)
      link: `${process.env.PUBLIC_APP_ORIGIN || 'http://localhost:3000'}/verify?token=${token}`,
    };
    // TODO: send email via your mailer here
  }

  const jwtToken = signToken(user);
  return res.status(201).json({
    success: true,
    data: {
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token: jwtToken,
      verification, // null unless enabled
    },
  });
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'email and password are required.' });
  }

  const emailKey = String(email).toLowerCase().trim();
  const attempt = await getAttempt(emailKey);

  // Enforce lock/backoff
  const { waitMs, locked } = computeWait(attempt);
  if (locked || waitMs > 0) {
    const seconds = Math.ceil(waitMs / 1000);
    return res.status(429).json({
      success: false,
      message: locked
        ? `Too many attempts. Try again in ${seconds}s.`
        : `Please wait ${seconds}s before trying again.`,
    });
  }

  const user = await User.findOne({ email: emailKey });
  if (!user) {
    await recordFail(attempt);
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    await recordFail(attempt);
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  // (Optional) gate by verification
  if (process.env.ENABLE_EMAIL_VERIFICATION === 'true') {
    const unverified = await VerificationToken.findOne({
      user: user._id,
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (unverified) {
      return res.status(403).json({
        success: false,
        message: 'Email not verified. Please check your inbox.',
      });
    }
  }

  await recordSuccess(attempt);

  const token = signToken(user);
  res.json({
    success: true,
    data: {
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      token,
    },
  });
});

/** POST /api/auth/verify-email  (optional) */
export const verifyEmail = asyncHandler(async (req, res) => {
  if (process.env.ENABLE_EMAIL_VERIFICATION !== 'true') {
    return res.status(404).json({ success: false, message: 'Email verification is disabled.' });
  }

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ success: false, message: 'token is required.' });

  const rec = await VerificationToken.findOne({ token });
  if (!rec || rec.expiresAt < new Date() || rec.consumedAt) {
    return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
  }

  rec.consumedAt = new Date();
  await rec.save();

  // Optionally mark user verified if your schema has such a flag
  // await User.findByIdAndUpdate(rec.user, { emailVerified: true });

  res.json({ success: true, message: 'Email verified.' });
});

/** GET /api/auth/me */
export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('_id name email role');
  res.json({ success: true, data: user });
});

// --- Password reset flow ---

/** POST /api/auth/forgot-password
 * Always returns 200 (to avoid email enumeration).
 * If the user exists, creates a 1-hour reset token and (optionally) sends email.
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    const emailKey = String(email || '').toLowerCase().trim();
    if (!emailKey) {
      return res.status(400).json({ success: false, message: 'email is required.' });
    }

    const user = await User.findOne({ email: emailKey }).select('_id email');
    // Always act like it worked (don’t leak if email exists or not)
    if (!user) {
      return res.json({ success: true, message: 'If the email is registered, a reset link will be sent.' });
    }

    // Create a fresh token (invalidate any previous tokens for this user)
    await PasswordResetToken.deleteMany({ user: user._id });
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await PasswordResetToken.create({ user: user._id, token, expiresAt });

    const appOrigin = process.env.PUBLIC_APP_ORIGIN || 'http://localhost:3000';
    const link = `${appOrigin}/reset-password?token=${token}`;

    // TODO: send email with your mailer here
    // await sendPasswordResetEmail(user.email, link);

    // In dev, you may want to reveal the link; in prod you wouldn’t.
    const revealLink = process.env.NODE_ENV !== 'production';

    return res.json({
      success: true,
      message: 'If the email is registered, a reset link will be sent.',
      ...(revealLink ? { debug: { link } } : {}),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/** POST /api/auth/reset-password
 * Body: { token, newPassword }
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'token and newPassword are required.' });
    }
    const rec = await PasswordResetToken.findOne({ token });
    if (!rec || rec.expiresAt < new Date() || rec.consumedAt) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
    }

    const user = await User.findById(rec.user).select('_id password');
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid token.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(String(newPassword), salt);
    user.password = hashed;
    await user.save();

    rec.consumedAt = new Date();
    await rec.save();

    return res.json({ success: true, message: 'Password has been reset. You can now log in.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// --- Back-compat aliases for existing routes ---
export { login as loginUser };
export { register as registerUser };
