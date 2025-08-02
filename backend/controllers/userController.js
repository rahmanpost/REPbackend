import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import generateToken from '../utils/generateJWT.js'; // assumed to be your own JWT utility



// @desc   Middleware to protect routes
export const protect = async (req, res, next) => {
  let token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    next();
  } catch (error) {
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};
// @desc   Register a new user
// @route  POST /api/users/register
export const registerUser = async (req, res) => {
  
  try {
    const { fullName, phoneNumber, email, password } = req.body;

    if (!fullName || !phoneNumber || !password) {
      return res.status(400).json({ message: 'Full name, phone number, and password are required' });
    }

    const userExists = await User.findOne({ phoneNumber });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this phone number' });
    }

    const user = await User.create({
      fullName,
      phoneNumber,
      email,
      password, // hashed via pre-save middleware
    });

    res.status(201).json({
      _id: user._id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      token: generateToken(user._id),
    });

  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// @desc   Login user
// @route  POST /api/users/login
export const loginUser = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    const user = await User.findOne({ phoneNumber });
    if (!user) return res.status(401).json({ message: 'Invalid phone or password' });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid phone or password' });

    res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Login Error: fullName, phoneNumber, role, are required.', error);
    res.status(500).json({ error: error.message });
  }
};

// @desc   Get all users (admin only)
// @route  GET /api/users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc   Get user by ID
// @route  GET /api/users/:id
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc   Delete user
// @route  DELETE /api/users/:id
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      _id: user._id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      email: user.email,
      addresses: user.addresses,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const { fullName, email, password } = req.body;
  if (fullName) user.fullName = fullName;
  if (email) user.email = email;
  if (password) user.password = password;

  const updatedUser = await user.save();

  res.json({
    _id: updatedUser._id,
    fullName: updatedUser.fullName,
    phoneNumber: updatedUser.phoneNumber,
    email: updatedUser.email,
    role: updatedUser.role,
    token: generateToken(updatedUser._id),
  });
};

// @desc    Add a new address
// @route   POST /api/users/addresses
// @access  Private
export const addAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.addresses.push(req.body);
    await user.save();
    res.status(201).json({ message: 'Address added', addresses: user.addresses });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update an existing address
// @route   PUT /api/users/addresses/:index
// @access  Private
export const updateAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.addresses[req.params.index] = req.body;
    await user.save();
    res.json({ message: 'Address updated', addresses: user.addresses });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Set default address
// @route   PATCH /api/users/addresses/:index/default
// @access  Private
export const setDefaultAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    user.addresses.forEach((addr) => (addr.isDefault = false));

    const index = req.params.index;
    if (!user.addresses[index]) {
      return res.status(404).json({ message: 'Address not found' });
    }

    user.addresses[index].isDefault = true;
    await user.save();

    res.json({ message: 'Default address set', addresses: user.addresses });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
