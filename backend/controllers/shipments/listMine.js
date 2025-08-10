// backend/controllers/shipments/listMine.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { httpError, toInt } from './_shared.js';

export const getMyShipments = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return httpError(res, 401, 'Unauthorized');

  const page = Math.max(1, toInt(req.query.page, 1));
  const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
  const skip = (page - 1) * limit;

  const { q, status, dateFrom, dateTo } = req.query;
  const filter = { sender: userId };

  if (q) {
    filter.$or = [
      { trackingId: String(q).toUpperCase() },
      { invoiceNumber: String(q) },
    ];
  }
  if (status) filter.status = String(status).toUpperCase();
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const [items, total] = await Promise.all([
    Shipment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Shipment.countDocuments(filter),
  ]);

  res.json({ success: true, page, limit, total, data: items });
});
