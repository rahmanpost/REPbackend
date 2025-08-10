// backend/models/agent.js
import mongoose from 'mongoose';
import { AFGHAN_PROVINCES } from '../utils/afghanistan.js';

const AgentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    employeeId: { type: String, required: true, unique: true, trim: true },
    branch: { type: String, trim: true },
    provinces: [{ type: String, enum: AFGHAN_PROVINCES }],
    phone: { type: String, trim: true },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

AgentSchema.index({ employeeId: 1 }, { unique: true });
AgentSchema.index({ user: 1 }, { unique: true });

const Agent = mongoose.model('Agent', AgentSchema);
export default Agent;
