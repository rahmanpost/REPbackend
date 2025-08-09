// backend/controllers/trackingController.js
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import Shipment from '../models/shipment.js';
import TrackingLog from '../models/TrackingLog.js';

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const clean = (v) =>
  typeof v === 'string'
    ? sanitizeHtml(v.trim(), { allowedTags: [], allowedAttributes: {} })
    : v;

/**
 * @desc  Agent updates shipment location (shipmentId in URL)
 * @route POST /api/track/:shipmentId/update-location
 * @access Private (Agent) – enforced by route middleware
 */
export const updateShipmentLocation = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { latitude, longitude, province, district, message, status } = req.body || {};

    if (!isObjectId(shipmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid shipment id' });
    }
    if (latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    // Optional: ensure this agent is assigned to the shipment (pickup or delivery)
    const agentId = String(req.user?._id || '');
    const assigned =
      String(shipment.pickupAgent || '') === agentId ||
      String(shipment.deliveryAgent || '') === agentId;
    // If you want to strictly enforce assignment, uncomment:
    // if (!assigned && req.user.role !== 'admin') {
    //   return res.status(403).json({ success: false, message: 'Not assigned to this shipment' });
    // }

    shipment.lastLocation = {
      province: clean(province),
      district: clean(district),
      geo: { latitude: Number(latitude), longitude: Number(longitude) },
    };

    if (status) {
      shipment.status = clean(status);
      if (shipment.status === 'PickedUp') shipment.pickedUpAt = new Date();
      if (shipment.status === 'Delivered') shipment.deliveredAt = new Date();
    }

    await shipment.save();

    await TrackingLog.create({
      shipment: shipment._id,
      status: shipment.status || 'LocationUpdated',
      message: clean(message) || 'Location updated',
      location: { province: clean(province), district: clean(district) },
      createdBy: req.user._id,
    });

    return res.json({
      success: true,
      message: 'Location updated',
      data: { status: shipment.status, lastLocation: shipment.lastLocation },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc  Agent updates shipment location (shipmentId in body)
 * @route POST /api/track/update
 * @access Private (Agent)
 */
export const updateLiveLocation = async (req, res) => {
  try {
    const { shipmentId, latitude, longitude, province, district, message, status } = req.body || {};
    if (!isObjectId(shipmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid shipment id' });
    }
    req.params.shipmentId = shipmentId; // reuse logic above
    req.body = { latitude, longitude, province, district, message, status };
    return updateShipmentLocation(req, res);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc  Get live tracking logs for a shipment (owner/admin/agent)
 * @route GET /api/track/:shipmentId
 * @access Private
 */
export const getLiveTracking = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    if (!isObjectId(shipmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid shipment id' });
    }

    const shipment = await Shipment.findById(shipmentId).lean();
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    // Ownership/role check (customer must be owner; admin/agent allowed)
    const isOwner = String(shipment.sender) === String(req.user._id);
    const allowed = isOwner || req.user.role === 'admin' || req.user.role === 'agent';
    if (!allowed) return res.status(403).json({ success: false, message: 'Forbidden' });

    const logs = await TrackingLog.find({ shipment: shipmentId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: { shipmentId, logs } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc  Get current shipment location (owner/admin/agent)
 * @route GET /api/track/:shipmentId/current-location
 * @access Private
 */
export const getCurrentShipmentLocation = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    if (!isObjectId(shipmentId)) {
      return res.status(400).json({ success: false, message: 'Invalid shipment id' });
    }

    const shipment = await Shipment.findById(shipmentId).lean();
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    const isOwner = String(shipment.sender) === String(req.user._id);
    const allowed = isOwner || req.user.role === 'admin' || req.user.role === 'agent';
    if (!allowed) return res.status(403).json({ success: false, message: 'Forbidden' });

    return res.json({
      success: true,
      data: { shipmentId, status: shipment.status, lastLocation: shipment.lastLocation },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
