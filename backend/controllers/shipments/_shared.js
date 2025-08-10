// backend/controllers/shipments/_shared.js
import mongoose from 'mongoose';

export const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

export const toInt = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};

export const httpError = (res, code, message) =>
  res.status(code).json({ success: false, message });

export const TERMINAL_STATUSES = new Set(['DELIVERED', 'RETURNED', 'CANCELLED']);
