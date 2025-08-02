import User from '../models/User.js';

// GET all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET user by ID
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT update user role
export const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;

    if (!['admin', 'customer', 'agent'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.role = role;
    await user.save();

    res.json({ message: 'User role updated', role: user.role });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE user
export const deleteUserById = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET all shipments with optional filters

export const getAllShipments = async (req, res) => {
  try {
    const { trackingId, status, startDate, endDate, phone } = req.query;

    let query = {};

    if (trackingId) {
      query.trackingId = trackingId;
    }

    if (status) {
      query.status = status;
    }

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (phone) {
      query.$or = [
        { 'receiver.phoneNumber': phone },
        { senderPhoneNumber: phone }, // this only works if you save sender phone separately
      ];
    }

    const shipments = await Shipment.find(query).sort({ createdAt: -1 });

    res.json(shipments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
