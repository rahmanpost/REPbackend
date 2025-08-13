import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

/** Liveness: process is up */
router.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString(),
    mongo: { state: mongoose.connection.readyState }, // 0=disconnected,1=connected,2=connecting,3=disconnecting
  });
});

/** Readiness: can we talk to Mongo right now? */
router.get('/readyz', async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ ok: false, reason: 'mongo not connected' });
    }
    // ping the server
    await mongoose.connection.db.admin().command({ ping: 1 });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(503).json({ ok: false, reason: err?.message || 'mongo ping failed' });
  }
});

export default router;
