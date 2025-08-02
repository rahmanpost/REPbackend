import User from '../models/User.js';

// @desc    Add a new address
// @route   POST /api/users/addresses
// @access  Private
export const addAddress = async (req, res) => {
  const user = await User.findById(req.user._id);
  const { label, addressLine, city, postalCode, isDefault } = req.body;

  user.addresses.push({ label, addressLine, city, postalCode, isDefault });
  if (isDefault) {
    user.addresses = user.addresses.map(a => ({
      ...a.toObject(),
      isDefault: a._id.toString() === user.addresses.slice(-1)[0]._id.toString()
    }));
  }
  await user.save();
  res.status(201).json(user.addresses);
};

// @desc    Update an address
// @route   PUT /api/users/addresses/:addrId
// @access  Private
export const updateAddress = async (req, res) => {
  const user = await User.findById(req.user._id);
  const addr = user.addresses.id(req.params.addrId);
  if (!addr) return res.status(404).json({ message: 'Address not found' });

  Object.assign(addr, req.body);
  if (req.body.isDefault) {
    user.addresses.forEach(a => { a.isDefault = a._id.toString() === addr._id.toString(); });
  }

  await user.save();
  res.json(user.addresses);
};

// @desc    Delete an address
// @route   DELETE /api/users/addresses/:addrId
// @access  Private
export const deleteAddress = async (req, res) => {
  const user = await User.findById(req.user._id);
  user.addresses.id(req.params.addrId).remove();
  await user.save();
  res.json(user.addresses);
};
