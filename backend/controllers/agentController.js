// backend/controllers/agentController.js
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import Shipment from '../models/shipment.js';
import TrackingLog from '../models/TrackingLog.js';

const clean = (v) =>
  typeof v === 'string'
    ? sanitizeHtml(v.trim(), { allowedTags: [], allowedAttributes: {} })
    : v;

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * @desc   Get shipments assigned to the logged-in agent (pickup or delivery)
 * @route  GET /api/agent/shipments
 * @access Private (agent)
 */
export const getAssignedShipments = async (req, res) => {
  try {
    const agentId = req.user?._id;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    const filter = {
      $or: [{ pickupAgent: agentId }, { deliveryAgent: agentId }],
    };

    const [items, total] = await Promise.all([
      Shipment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Shipment.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Get deliveries for logged-in agent (convenience)
 * @route  GET /api/agent/deliveries
 * @access Private (agent)
 */
export const getMyDeliveries = async (req, res) => {
  try {
    const agentId = req.user?._id;
    const list = await Shipment.find({ deliveryAgent: agentId })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, data: list });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Generic progress update by agent
 * @route  PUT /api/agent/shipments/:id/progress
 * @access Private (agent)
 */
export const updateShipmentProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, location } = req.body || {};

    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid shipment id' });
    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

    const shipment = await Shipment.findById(id);
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    // Ensure the agent is assigned to this shipment
    const agentId = String(req.user._id);
    const assigned =
      String(shipment.pickupAgent || '') === agentId || String(shipment.deliveryAgent || '') === agentId;
    if (!assigned) return res.status(403).json({ success: false, message: 'Not assigned to this shipment' });

    shipment.status = clean(status);
    if (location?.province || location?.district) {
      shipment.lastLocation = {
        province: clean(location?.province),
        district: clean(location?.district),
        geo: location?.geo,
      };
    }
    if (note) {
      shipment.notes = [shipment.notes, clean(note)].filter(Boolean).join('\n');
    }

    if (shipment.status === 'PickedUp') shipment.pickedUpAt = new Date();
    if (shipment.status === 'Delivered') shipment.deliveredAt = new Date();

    await shipment.save();

    await TrackingLog.create({
      shipment: shipment._id,
      status: shipment.status,
      message: clean(note),
      location: {
        province: clean(location?.province),
        district: clean(location?.district),
      },
      createdBy: req.user._id,
    });

    return res.json({ success: true, message: 'Progress updated', data: { status: shipment.status } });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Confirm pickup
 * @route  PUT /api/agent/shipments/:id/confirm-pickup
 * @access Private (agent)
 */
export const confirmPickup = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid shipment id' });

    const shipment = await Shipment.findById(id);
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    shipment.status = 'PickedUp';
    shipment.pickedUpAt = new Date();
    await shipment.save();

    await TrackingLog.create({
      shipment: shipment._id,
      status: 'PickedUp',
      message: 'Pickup confirmed',
      createdBy: req.user._id,
    });

    return res.json({ success: true, message: 'Pickup confirmed' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Confirm delivery
 * @route  PUT /api/agent/shipments/:id/confirm-delivery
 * @access Private (agent)
 */
export const confirmDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid shipment id' });

    const shipment = await Shipment.findById(id);
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    shipment.status = 'Delivered';
    shipment.deliveredAt = new Date();
    await shipment.save();

    await TrackingLog.create({
      shipment: shipment._id,
      status: 'Delivered',
      message: 'Delivery confirmed',
      createdBy: req.user._id,
    });

    return res.json({ success: true, message: 'Delivery confirmed' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Update delivery status (custom)
 * @route  PUT /api/agent/shipments/:id/delivery-status
 * @access Private (agent)
 */
export const updateDeliveryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body || {};
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid shipment id' });
    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

    const shipment = await Shipment.findById(id);
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    shipment.status = clean(status);
    if (note) shipment.notes = [shipment.notes, clean(note)].filter(Boolean).join('\n');
    await shipment.save();

    await TrackingLog.create({
      shipment: shipment._id,
      status: shipment.status,
      message: clean(note),
      createdBy: req.user._id,
    });

    return res.json({ success: true, message: 'Delivery status updated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Mark shipment picked up (alternate endpoint)
 * @route  PUT /api/agent/shipments/:id/picked-up
 * @access Private (agent)
 */
export const markShipmentPickedUp = async (req, res) => {
  req.params.id && (req.body.status = 'PickedUp');
  return updateShipmentProgress(req, res);
};

/**
 * @desc   Record a delivery attempt
 * @route  PUT /api/agent/shipments/:id/delivery-attempt
 * @access Private (agent)
 */
export const markDeliveryAttempt = async (req, res) => {
  req.params.id && (req.body.status = 'DeliveryAttempted');
  return updateShipmentProgress(req, res);
};

/**
 * @desc   Mark as returned/returning
 * @route  PUT /api/agent/shipments/:id/return-status
 * @access Private (agent)
 */
export const markReturnStatus = async (req, res) => {
  req.params.id && (req.body.status = 'Returned');
  return updateShipmentProgress(req, res);
};

/**
 * @desc   Explicitly switch to a "Returning" state
 * @route  PUT /api/agent/shipments/:id/return
 * @access Private (agent)
 */
export const markAsReturning = async (req, res) => {
  req.params.id && (req.body.status = 'Returning');
  return updateShipmentProgress(req, res);
};
