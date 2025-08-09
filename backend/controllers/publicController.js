// backend/controllers/publicController.js
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import Shipment from '../models/shipment.js';

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const clean = (v) =>
  typeof v === 'string'
    ? sanitizeHtml(v.trim(), { allowedTags: [], allowedAttributes: {} })
    : v;

/**
 * @desc   Public tracking by trackingId (no auth)
 * @route  GET /api/public/:trackingId
 * @access Public
 *
 * Returns minimal, safe shipment data:
 *  - trackingId, status
 *  - lastLocation (province/district)
 *  - from/to provinces (not personal names/phones)
 *  - createdAt, deliveredAt (if any)
 */
export const trackShipment = async (req, res) => {
  try {
    const trackingId = clean(req.params?.trackingId);
    if (!trackingId || trackingId.length < 6) {
      return res.status(400).json({ success: false, message: 'Invalid tracking ID' });
    }

    const doc = await Shipment.findOne({ trackingId })
      .select([
        'trackingId',
        'status',
        'lastLocation.province',
        'lastLocation.district',
        'from.province',
        'to.province',
        'createdAt',
        'deliveredAt',
      ])
      .lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    return res.json({
      success: true,
      data: {
        trackingId: doc.trackingId,
        status: doc.status,
        fromProvince: doc.from?.province || null,
        toProvince: doc.to?.province || null,
        lastLocation: {
          province: doc.lastLocation?.province || null,
          district: doc.lastLocation?.district || null,
        },
        createdAt: doc.createdAt,
        deliveredAt: doc.deliveredAt || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
