import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import userRoutes from './routes/userRoutes.js';
import shipmentRoutes from './routes/shipmentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import connectDB from './config/db.js'; // Make sure this path is correct


// Load .env file
dotenv.config();

const app = express();
connectDB(); // <-- connect to MongoDB here
// Middleware to parse JSON
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Routes

app.use('/api/users', userRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/public', publicRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('🚀 Rahman Express Post API is running...');
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
