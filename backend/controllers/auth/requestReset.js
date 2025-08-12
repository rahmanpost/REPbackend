import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import User from '../../models/User.js';
import { sendPasswordResetEmail } from '../../utils/mailer.js';

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

function genToken() {
  return crypto.randomBytes(32).toString('hex'); // 64 chars
}

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const emailRaw = req.body?.email;
  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
  if (!email) {
    return res.status(400).json({ success: false, message: 'email is required' });
  }

  const user = await User.findOne({ email });

  // Always reply OK (avoid user enumeration)
  if (!user) {
    return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  }

  // Throttle: if a valid token already exists, don’t spam
  if (user.passwordReset?.expiresAt && user.passwordReset.expiresAt > new Date()) {
    return res.json({ success: true, message: 'A reset link was recently sent. Please check your inbox.' });
  }

  // Create token, store hash + 30m TTL
  const token = genToken();
  user.passwordReset = {
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  };
  await user.save();

  // Build link for your front-end reset page
  const APP_ORIGIN = process.env.APP_ORIGIN || process.env.API_ORIGIN || 'http://localhost:5000';
  const resetUrl = `${APP_ORIGIN.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  try {
    await sendPasswordResetEmail({ to: email, resetUrl });
  } catch (err) {
    // If sending fails, clear the token so user can retry later
    user.passwordReset = undefined;
    await user.save();
    return res.status(500).json({ success: false, message: 'Failed to send email, please try again later.' });
  }

  return res.json({ success: true, message: 'Reset email sent if the account exists.' });
});

export default requestPasswordReset;
