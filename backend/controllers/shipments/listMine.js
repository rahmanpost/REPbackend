// backend/controllers/shipments/listMine.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';

export const getMyShipments = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { status, page = 1, limit = 20, from, to, q } = req.query || {};

  const query = { sender: userId };

  if (status) query.status = String(status).trim().toUpperCase();

  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  if (q) {
    const term = String(q).trim();
    if (term) {
      query.$or = [
        { invoiceNumber: { $regex: term, $options: 'i' } },
        { trackingId: { $regex: term, $options: 'i' } },
      ];
    }
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    Shipment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    Shipment.countDocuments(query),
  ]);

  return res.json({
    success: true,
    data: { items, total, page: pageNum, limit: limitNum },
  });
});
