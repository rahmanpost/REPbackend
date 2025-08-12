// backend/server.js
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import connectDB from './config/db.js';
import { mongoSanitize5 } from './middleware/mongoSanitize5.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { apiLimiter } from './middleware/rateLimiter.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import shipmentRoutes from './routes/shipmentRoutes.js';
// import trackingRoutes from './routes/trackingRoutes.js'; // ⟵ removed (legacy)
import invoiceRoutes from './routes/invoiceRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';



// __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars (backend/.env, relative to this file)
dotenv.config({ path: path.join(__dirname, '.env') });

// Connect to database
connectDB();

const app = express();

// Trust reverse proxy
app.set('trust proxy', 1);

// Logging (dev only)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Cookies
app.use(cookieParser());

// Express 5–safe Mongo sanitizer (mutates; does not reassign req.query)
app.use(mongoSanitize5({ allowDots: true }));

// Basic global limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, try again later.' },
});
app.use(limiter);

// API-specific limiter (your custom one)
app.use('/api', apiLimiter);

// Healthcheck
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'development' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/shipments', shipmentRoutes);
// app.use('/api/track', trackingRoutes); // ⟵ removed (legacy path now /api/public/track/:trackingId)
app.use('/api/invoice', invoiceRoutes);
app.use('/api/public', publicRoutes);      // /api/public/track/:trackingId + /api/public/pricing/quote
app.use('/api/pricing', pricingRoutes);    // admin/user pricing routes you already have
app.use('/api/upload', uploadRoutes);
app.use('/api/admin/pricing', pricingRoutes);

// Static files (uploads)
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', express.static(path.join(process.cwd(), 'backend', 'uploads')));

// 404 + error handler
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export default app;
