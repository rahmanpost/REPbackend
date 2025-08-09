// backend/middleware/rateLimiter.js
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Helper: build a limiter with good defaults
 */
function makeLimiter({
  windowMs,
  max,
  message = 'Too many requests, please try again later.',
  standardHeaders = true,
  legacyHeaders = false,
  skip = () => false,
} = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    skip,
    keyGenerator: (req) => {
      // Prefer authenticated user ID; otherwise use the IPv6-safe helper
      const uid = req.user?._id || req.user?.id;
      return uid ? `u:${uid}` : `ip:${ipKeyGenerator(req)}`;
    },
    handler: (req, res) =>
      res.status(429).json({ success: false, message }),
  });
}

/** Global API limiter */
export const apiLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  max: 300,
  message: 'Rate limit exceeded. Please wait a moment and try again.',
  skip: (req) => req.path === '/health' || req.path === '/api/health',
});

/** Auth/login limiter */
export const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message:
    'Too many login attempts. Please wait a few minutes before trying again.',
});

/** Invoice download limiter */
export const invoiceLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Invoice download rate limit hit. Try again later.',
});

/** File upload limiter */
export const fileUploadLimiter = makeLimiter({
  windowMs: 30 * 60 * 1000,
  max: 60,
  message: 'Upload limit reached. Please wait before uploading more files.',
});

/** Ad-hoc custom limiter */
export const makeCustomLimiter = (max, windowMs) =>
  makeLimiter({ max, windowMs });
