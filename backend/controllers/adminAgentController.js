import User from '../models/User.js';

// @desc   Create a new agent
// @route  POST /api/admin/agents
// @access Admin
export const createAgent = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already exists' });
    }

    const agent = await User.create({
      name,
      email,
      phone,
      password,
      role: 'agent',
    });

    res.status(201).json({
      _id: agent._id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      role: agent.role,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc   Get all agents
// @route  GET /api/admin/agents
// @access Admin
export const getAllAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent' }).select('-password');
    res.json(agents);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc   Get single agent
// @route  GET /api/admin/agents/:id
// @access Admin
export const getAgentById = async (req, res) => {
  try {
    const agent = await User.findOne({ _id: req.params.id, role: 'agent' }).select('-password');
    if (!agent) return res.status(404).json({ message: 'Agent not found' });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc   Update agent
// @route  PUT /api/admin/agents/:id
// @access Admin
export const updateAgent = async (req, res) => {
  try {
    const agent = await User.findOne({ _id: req.params.id, role: 'agent' });
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const { name, email, phone } = req.body;
    if (name) agent.name = name;
    if (email) agent.email = email;
    if (phone) agent.phone = phone;

    await agent.save();

    res.json({
      _id: agent._id,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      role: agent.role,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc   Delete agent
// @route  DELETE /api/admin/agents/:id
// @access Admin
export const deleteAgent = async (req, res) => {
  try {
    const agent = await User.findOne({ _id: req.params.id, role: 'agent' });
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    await agent.remove();
    res.json({ message: 'Agent removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};



