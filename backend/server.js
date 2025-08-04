import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import userRoutes from './routes/userRoutes.js';
import shipmentRoutes from './routes/shipmentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';
import connectDB from './config/db.js';

dotenv.config();
const app = express();
connectDB();

// ✅ Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // <-- Add this

// ✅ Routes
app.use('/api/pricing', pricingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/track', publicRoutes);

app.get('/', (req, res) => {
  res.send('🚀 Rahman Express Post API is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
