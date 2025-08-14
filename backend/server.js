// Load env FIRST so downstream imports (routes/controllers) see process.env
import './config/loadEnv.js';
import healthRoutes from './routes/healthRoutes.js';


import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import connectDB from './config/db.js';
import { mongoSanitize5 } from './middleware/mongoSanitize5.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import docsRoutes from './routes/docsRoutes.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import shipmentRoutes from './routes/shipmentRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import utilRoutes from './routes/utilRoutes.js'; // ← Postman mail test, etc.
import superAdminRoutes from './routes/superAdminRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';


// __dirname in ESM (still useful for paths)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Connect to database
connectDB();

const app = express();

// Security & platform
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Logging (dev only)
if ((process.env.NODE_ENV || '').toLowerCase() === 'development') {
  app.use(morgan('dev'));
}

// Security headers (loosen CORP so /uploads can be embedded if needed)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
app.use('/api', healthRoutes); // exposes /api/healthz and /api/readyz
app.use('/api/docs', docsRoutes);
// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Cookies
app.use(cookieParser());

// Sanitize Mongo operators in query/body
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

// Static files (uploads)
app.use('/uploads', express.static(path.join(process.cwd(), 'backend', 'uploads')));

// Routes
// Mount super admin routes
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/invoice', invoiceRoutes);
app.use('/api/public', publicRoutes);      // /api/public/track/:trackingId + pricing quote
app.use('/api/pricing', pricingRoutes);    // user/admin pricing
app.use('/api/upload', uploadRoutes);
app.use('/api/utils', utilRoutes);         // ← adds /api/utils/test-mail
app.use('/api', paymentRoutes);

// 404 + error handler
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export default app;
