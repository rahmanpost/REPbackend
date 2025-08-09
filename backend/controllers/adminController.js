// backend/controllers/adminController.js
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import Shipment from '../models/shipment.js';
import User from '../models/User.js';
import Pricing from '../models/pricing.js';
import TrackingLog from '../models/TrackingLog.js';

const clean = (v) =>
  typeof v === 'string'
    ? sanitizeHtml(v.trim(), { allowedTags: [], allowedAttributes: {} })
    : v;

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ----------------------------- PRICING ADMIN ----------------------------- */

// Create or update pricing for a route
export const createOrUpdatePricing = async (req, res) => {
  try {
    const fromProvince = clean(req.body?.fromProvince)?.toLowerCase();
    const toProvince = clean(req.body?.toProvince)?.toLowerCase();
    const price = Number(req.body?.price);

    if (!fromProvince || !toProvince || !Number.isFinite(price)) {
      return res.status(400).json({ success: false, message: 'fromProvince, toProvince, price are required' });
    }

    const doc = await Pricing.findOneAndUpdate(
      { fromProvince, toProvince },
      { fromProvince, toProvince, price, currency: req.body?.currency || 'AFN' },
      { new: true, upsert: true }
    );

    return res.json({ success: true, message: 'Pricing saved', data: doc });
  } catch (error) {
    const conflict = error?.code === 11000;
    return res.status(conflict ? 409 : 500).json({
      success: false,
      message: conflict ? 'Pricing already exists for this route' : 'Server error',
      error: error.message,
    });
  }
};

// List all pricing (simple, admin view)
export const getAllPricing = async (_req, res) => {
  try {
    const list = await Pricing.find({}).sort({ fromProvince: 1, toProvince: 1 }).lean();
    return res.json({ success: true, data: list });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get single pricing by path params
export const getPricingByRoute = async (req, res) => {
  try {
    const fromProvince = clean(req.params?.fromProvince)?.toLowerCase();
    const toProvince = clean(req.params?.toProvince)?.toLowerCase();

    if (!fromProvince || !toProvince) {
      return res.status(400).json({ success: false, message: 'fromProvince and toProvince are required' });
    }

    const priceDoc = await Pricing.findOne({ fromProvince, toProvince }).lean();
    if (!priceDoc) return res.status(404).json({ success: false, message: 'No pricing for this route' });

    return res.json({ success: true, data: priceDoc });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Delete pricing for a specific route
export const deletePricing = async (req, res) => {
  try {
    const fromProvince = clean(req.params?.fromProvince)?.toLowerCase();
    const toProvince = clean(req.params?.toProvince)?.toLowerCase();

    const del = await Pricing.findOneAndDelete({ fromProvince, toProvince });
    if (!del) return res.status(404).json({ success: false, message: 'Pricing not found' });

    return res.json({ success: true, message: 'Pricing deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/* ---------------------------- SHIPMENT ADMIN ----------------------------- */

// List shipments with optional filters + pagination
export const getAllShipments = async (req, res) => {
  try {
    const {
      status,
      agentId,          // pickup or delivery agent id
      customerPhone,    // by sender phone
      trackingId,
      fromProvince,
      toProvince,
      page = '1',
      limit = '20',
    } = req.query;

    const filter = {};

    if (status) filter.status = clean(status);
    if (trackingId) filter.trackingId = clean(trackingId);
    if (fromProvince) filter['from.province'] = clean(fromProvince);
    if (toProvince) filter['to.province'] = clean(toProvince);
    if (agentId && isObjectId(agentId)) {
      filter.$or = [
        { pickupAgent: new mongoose.Types.ObjectId(agentId) },
        { deliveryAgent: new mongoose.Types.ObjectId(agentId) },
      ];
    }
    if (customerPhone) {
      // resolve sender by phone
      const sender = await User.findOne({ phone: clean(customerPhone) }).select('_id');
      if (sender) filter.sender = sender._id; else filter.sender = '__none__'; // no results
    }

    const pageN = Math.max(parseInt(page, 10) || 1, 1);
    const limitN = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageN - 1) * limitN;

    const [items, total] = await Promise.all([
      Shipment.find(filter)
        .populate('pickupAgent', 'fullName phone role')
        .populate('deliveryAgent', 'fullName phone role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitN)
        .lean(),
      Shipment.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: { page: pageN, limit: limitN, total, pages: Math.ceil(total / limitN) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get a single shipment (admin)
export const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: 'Invalid shipment id' });

    const doc = await Shipment.findById(id)
      .populate('pickupAgent', 'fullName phone role')
      .populate('deliveryAgent', 'fullName phone role')
      .lean();

    if (!doc) return res.status(404).json({ success: false, message: 'Shipment not found' });

    return res.json({ success: true, data: doc });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Assign agent to a shipment (either pickup or delivery)
export const assignAgentToShipment = async (req, res) => {
  try {
    const { shipmentId, agentId, type } = req.body || {};
    if (!isObjectId(shipmentId) || !isObjectId(agentId) || !['pickup', 'delivery'].includes(type)) {
      return res.status(400).json({ success: false, message: 'shipmentId, agentId, and type (pickup|delivery) are required' });
    }

    const agent = await User.findById(agentId);
    if (!agent || agent.role !== 'agent') {
      return res.status(400).json({ success: false, message: 'Agent not found or not an agent' });
    }

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) return res.status(404).json({ success: false, message: 'Shipment not found' });

    if (type === 'pickup') shipment.pickupAgent = agent._id;
    else shipment.deliveryAgent = agent._id;

    await shipment.save();

    await TrackingLog.create({
      shipment: shipment._id,
      status: 'AgentAssigned',
      message: `Assigned ${type} agent: ${agent.fullName || agent._id}`,
      createdBy: req.user?._id,
    });

    return res.json({ success: true, message: `Assigned ${type} agent`, data: { shipmentId: shipment._id, agentId: agent._id, type } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/* ------------------------------ DASHBOARD -------------------------------- */

// Simple stats for admin dashboard
export const getDashboardStats = async (_req, res) => {
  try {
    const [
      totalUsers,
      totalAgents,
      totalShipments,
      createdToday,
      deliveredTotal,
      inTransit,
      pricingRoutes,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: 'agent' }),
      Shipment.countDocuments({}),
      Shipment.countDocuments({
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(24, 0, 0, 0)),
        },
      }),
      Shipment.countDocuments({ status: 'Delivered' }),
      Shipment.countDocuments({ status: { $in: ['PickedUp', 'InTransit', 'OutForDelivery'] } }),
      Pricing.countDocuments({}),
    ]);

    return res.json({
      success: true,
      data: {
        users: { total: totalUsers, agents: totalAgents },
        shipments: {
          total: totalShipments,
          today: createdToday,
          delivered: deliveredTotal,
          inTransit,
        },
        pricingRoutes,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
