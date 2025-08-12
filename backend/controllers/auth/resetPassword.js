import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import User from '../../models/User.js';

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

export const resetPassword = asyncHandler(async (req, res) => {
  const emailRaw = req.body?.email;
  const tokenRaw = req.body?.token;
  const newPassword = req.body?.newPassword;

  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
  const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';

  if (!email || !token || !newPassword) {
    return res.status(400).json({ success: false, message: 'email, token and newPassword are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'newPassword must be at least 8 characters' });
  }

  const user = await User.findOne({
    email,
    'passwordReset.tokenHash': sha256(token),
  });

  if (!user || !user.passwordReset?.expiresAt || user.passwordReset.expiresAt < new Date()) {
    return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
  }

  // Let your pre-save hook hash this
  user.password = String(newPassword);
  user.passwordReset = undefined; // clear reset state
  await user.save();

  return res.json({ success: true, message: 'Password reset successful. You can now log in.' });
});

export default resetPassword;
