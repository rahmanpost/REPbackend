import Shipment from '../models/shipment.js';
import User from '../models/User.js';
import Pricing from '../models/pricing.js';

// Create or update pricing for a route
export const createOrUpdatePricing = async (req, res) => {
  const { fromProvince, toProvince, price } = req.body;

  if (!fromProvince || !toProvince || price == null) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const pricing = await Pricing.findOneAndUpdate(
      { fromProvince, toProvince },
      { price },
      { new: true, upsert: true }
    );

    res.json({ message: 'Pricing saved successfully', pricing });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all pricing
export const getAllPricing = async (req, res) => {
  try {
    const pricing = await Pricing.find().sort({ fromProvince: 1, toProvince: 1 });
    res.json(pricing);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get price for specific route
export const getPricingByRoute = async (req, res) => {
  const { fromProvince, toProvince } = req.params;

  try {
    const pricing = await Pricing.findOne({ fromProvince, toProvince });
    if (!pricing) {
      return res.status(404).json({ message: 'Pricing not found for this route' });
    }
    res.json(pricing);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete pricing for a specific route
export const deletePricing = async (req, res) => {
  const { fromProvince, toProvince } = req.params;

  try {
    const result = await Pricing.findOneAndDelete({ fromProvince, toProvince });
    if (!result) {
      return res.status(404).json({ message: 'Pricing not found to delete' });
    }
    res.json({ message: 'Pricing deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};




// @desc    Get all shipments (with optional filters)
// @route   GET /api/admin/shipments
// @access  Admin only
export const getAllShipments = async (req, res) => {
  try {
    const { status, agentId, customerEmail, keyword } = req.query;

    let filter = {};

    if (status) filter.status = status;
    if (agentId) filter.assignedAgent = agentId;

    // 🔍 Search by keyword (sender/receiver name or phone)
    if (keyword) {
      filter.$or = [
        { senderName: { $regex: keyword, $options: 'i' } },
        { receiverName: { $regex: keyword, $options: 'i' } },
        { senderPhone: { $regex: keyword, $options: 'i' } },
        { receiverPhone: { $regex: keyword, $options: 'i' } }
      ];
    }

    // 🎯 Filter by customer email (find user by email)
    if (customerEmail) {
      const user = await User.findOne({ email: customerEmail });
      if (user) {
        filter.user = user._id;
      } else {
        return res.status(404).json({ message: 'Customer not found' });
      }
    }

    const shipments = await Shipment.find(filter)
      .populate('sender', 'name email')
      .populate('agent', 'name email');

    res.json(shipments);
  } catch (error) {
    console.error('Failed to fetch shipments:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


// @desc    Get a shipment by ID (admin only)
// @route   GET /api/admin/shipments/:id
// @access  Admin
export const getShipmentById = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    res.json(shipment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// @desc    Update shipment status (admin only)
// @route   PUT /api/admin/shipments/:id/status
// @access  Admin
export const updateShipmentStatus = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    const { status } = req.body;

    // ✅ Validate status input to prevent invalid updates
    const allowedStatuses = [
      'pickup-scheduled',
      'picked-up',
      'origin-hub',
      'in-transit',
      'delivery-failed',
      'returning',
      'delivered',
      'returned-to-sender',
      'cancelled',
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    shipment.status = status;
    const updated = await shipment.save();

    res.json({
      message: 'Shipment status updated successfully',
      status: updated.status,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// backend/controllers/adminController.js
export const getAdminStats = async (req, res) => {
  try {
    const totalShipments = await Shipment.countDocuments();
    const delivered = await Shipment.countDocuments({ status: 'delivered' });
    const inTransit = await Shipment.countDocuments({ status: 'in-transit' });

    res.json({ totalShipments, delivered, inTransit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



export const assignAgentToShipment = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const { agentId } = req.body;
    const agent = await User.findById(agentId);

    if (!agent || agent.role !== 'agent') {
      return res.status(400).json({ message: 'Invalid agent user' });
    }

    shipment.agent = agentId;
    await shipment.save();

    res.status(200).json({
      message: 'Agent assigned to shipment',
      shipmentId: shipment._id,
      agentId: agent._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};


// @desc    Get dashboard stats
// @route   GET /api/admin/dashboard
// @access  Admin only
export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalShipments,
      delivered,
      pending,
      returned,
      cancelled,
      totalUsers,
      totalAgents
    ] = await Promise.all([
      Shipment.countDocuments({}),
      Shipment.countDocuments({ status: 'Delivered' }),
      Shipment.countDocuments({ status: 'Pending' }),
      Shipment.countDocuments({ status: 'Returned' }),
      Shipment.countDocuments({ status: 'Cancelled' }),
      User.countDocuments({}),
      User.countDocuments({ role: 'agent' }),
    ]);

    res.json({
      totalShipments,
      delivered,
      pending,
      returned,
      cancelled,
      totalUsers,
      totalAgents,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;

    const filter = role ? { role } : {};

    const users = await User.find(filter).select('-password');

    res.json(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ message: 'Server error' });
  }
};