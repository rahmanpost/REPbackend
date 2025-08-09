import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import User from '../models/User.js';

const { isValid: isValidObjectId } = mongoose.Types.ObjectId;

/** Helpers */
const cleanStr = (v) =>
  typeof v === 'string'
    ? sanitizeHtml(v.trim(), { allowedTags: [], allowedAttributes: {} })
    : v;

const userSafeProjection = '-password -__v';

/**
 * @desc   Get current user's profile
 * @route  GET /api/users/profile
 * @access Private (protect)
 */
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user?._id).select(userSafeProjection);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Update current user's profile (name/email/phone/password)
 * @route  PUT /api/users/profile
 * @access Private (protect)
 */
export const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user?._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { fullName, email, phone, password } = req.body || {};

    if (fullName !== undefined) user.fullName = cleanStr(fullName);
    if (email !== undefined) user.email = cleanStr(email).toLowerCase();
    if (phone !== undefined) user.phone = cleanStr(phone);
    if (password) user.password = password; // will hash via pre('save')

    await user.save();
    const safe = await User.findById(user._id).select(userSafeProjection);
    return res.json({ success: true, message: 'Profile updated', data: safe });
  } catch (err) {
    // Handle duplicate phone/email nicely
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: 'Phone already in use' });
    }
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Add an address to current user
 * @route  POST /api/users/addresses
 * @access Private (protect)
 */
export const addAddress = async (req, res) => {
  try {
    const u = await User.findById(req.user?._id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });

    const addr = {
      province: cleanStr(req.body?.province),
      district: cleanStr(req.body?.district),
      street: cleanStr(req.body?.street),
      details: cleanStr(req.body?.details),
      isDefault: !!req.body?.isDefault,
    };

    // If first address, make it default
    if (!u.addresses || u.addresses.length === 0) addr.isDefault = true;

    u.addresses.push(addr);
    await u.save();

    return res.status(201).json({
      success: true,
      message: 'Address added',
      data: u.addresses,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Set default address by addressId
 * @route  PUT /api/users/addresses/default/:addressId
 * @access Private (protect)
 */
export const setDefaultAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const u = await User.findById(req.user?._id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });

    const idx = u.addresses.findIndex((a) => String(a._id) === String(addressId));
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    // Clear previous defaults and set new one
    u.addresses = u.addresses.map((a, i) => ({ ...a.toObject(), isDefault: i === idx }));
    await u.save();

    return res.json({ success: true, message: 'Default address updated', data: u.addresses });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Get all users (admin)
 * @route  GET /api/users
 * @access Private/Admin
 */
export const getAllUsers = async (req, res) => {
  try {
    // Basic pagination
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      User.find({})
        .select(userSafeProjection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments({}),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Get user by ID (admin)
 * @route  GET /api/users/:id
 * @access Private/Admin
 */
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const user = await User.findById(id).select(userSafeProjection);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Delete user (admin)
 * @route  DELETE /api/users/:id
 * @access Private/Admin
 */
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const del = await User.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Upload profile picture (multer provides req.file)
 * @route  PUT /api/users/upload-profile
 * @access Private
 */
export const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const user = await User.findById(req.user?._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.profilePicture = req.file.path; // adjust if you store URLs
    await user.save();

    const safe = await User.findById(user._id).select(userSafeProjection);
    return res.json({ success: true, message: 'Profile picture uploaded', data: safe });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
