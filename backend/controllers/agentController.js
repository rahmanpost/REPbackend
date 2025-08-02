import Shipment from '../models/shipment.js';

// Get shipments assigned to this agent
export const getAssignedShipments = async (req, res) => {
  try {
    const shipments = await Shipment.find({ assignedAgent: req.user._id }).sort({ createdAt: -1 });
    res.json(shipments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Agent updates shipment progress
export const updateShipmentProgress = async (req, res) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      assignedAgent: req.user._id,
    });

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found or not assigned to you' });
    }

    const { status } = req.body;

    // Optional: validate status values
    shipment.status = status;
    const updated = await shipment.save();

    res.json({
      message: 'Shipment status updated by agent',
      status: updated.status,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Agent confirms pickup of a shipment
// @route   PUT /api/agent/shipments/:id/pickup
// @access  Agent only
export const confirmPickup = async (req, res) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      assignedAgent: req.user._id,
    });

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found or not assigned to you' });
    }

    shipment.status = 'picked-up';
    shipment.pickupConfirmedAt = new Date(); // Optional: you can save confirmation timestamp
    const updated = await shipment.save();

    res.json({
      message: 'Pickup confirmed',
      shipment: updated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Agent confirms delivery of a shipment
// @route   PUT /api/agent/shipments/:id/deliver
// @access  Agent only
export const confirmDelivery = async (req, res) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      assignedAgent: req.user._id,
    });

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found or not assigned to you' });
    }

    // Only allow if shipment is already picked up
    if (shipment.status !== 'picked-up' && shipment.status !== 'in-transit') {
      return res.status(400).json({
        message: `Cannot confirm delivery unless status is 'picked-up' or 'in-transit'`,
      });
    }

    shipment.status = 'delivered';
    shipment.deliveredAt = new Date(); // Optional field to track delivery timestamp
    const updated = await shipment.save();

    res.json({
      message: 'Delivery confirmed',
      shipment: updated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Agent updates delivery status
// @route   PUT /api/agent/shipments/:id/deliver
// @access  Agent only
export const updateDeliveryStatus = async (req, res) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      assignedAgent: req.user._id,
    });

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found or not assigned to you' });
    }

    const { status } = req.body;

    if (!['delivered', 'delivery-failed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid delivery status' });
    }

    shipment.status = status;
    shipment.deliveryUpdatedAt = new Date(); // optional timestamp

    const updated = await shipment.save();

    res.json({
      message: `Delivery status updated to '${status}'`,
      shipment: updated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Mark shipment as picked up
// @route   PUT /api/agent/shipments/:id/pickup
// @access  Agent only
export const markShipmentPickedUp = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    // Optional: Only allow assigned agent to do this
    if (shipment.assignedAgent?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    shipment.status = 'picked-up';
    const updated = await shipment.save();

    res.json({
      message: 'Shipment marked as picked up',
      status: updated.status,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Mark shipment as delivered or failed
// @route   PUT /api/agent/shipments/:id/delivery-attempt
// @access  Agent only
export const markDeliveryAttempt = async (req, res) => {
  try {
    const { status } = req.body;

    const allowed = ['delivered', 'delivery-failed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    // Optional: Check if current agent is assigned
    if (shipment.assignedAgent?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    shipment.status = status;
    const updated = await shipment.save();

    res.json({
      message: `Shipment marked as ${status}`,
      status: updated.status,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark shipment as returning or returned-to-sender
// @route   PUT /api/agent/shipments/:id/return-status
// @access  Agent only
export const markReturnStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const allowed = ['returning', 'returned-to-sender'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid return status' });
    }

    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    // Optional: Check authorization
    if (shipment.assignedAgent?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update return status' });
    }

    shipment.status = status;
    const updated = await shipment.save();

    res.json({
      message: `Shipment marked as ${status}`,
      status: updated.status,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};




// @desc    Mark shipment as returning to sender
// @route   PUT /api/agent/shipments/:id/return
export const markAsReturning = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    // You could also check if shipment.status === 'delivery-failed' first
    shipment.status = 'returning';
    await shipment.save();

    res.status(200).json({ message: 'Shipment marked as returning' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

