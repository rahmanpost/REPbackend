import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';

import connectDB from './config/db.js';

// ✅ Import Routes
import userRoutes from './routes/userRoutes.js';
import shipmentRoutes from './routes/shipmentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';
import trackingRoutes from './routes/trackingRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';




dotenv.config();


const app = express();

// Security middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(mongoSanitize());
app.use(cors());

// ✅ Connect to MongoDB
connectDB();

// ✅ Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve uploaded files (photos, receipts, etc.)
app.use('/uploads', express.static(path.join(process.cwd(), '/uploads')));

// ✅ Routes
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/invoices', invoiceRoutes);




// ✅ Root Route
app.get('/', (req, res) => {
  res.send('🚀 Rahman Express Post API is running...');
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
