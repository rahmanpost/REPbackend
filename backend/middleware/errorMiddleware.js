// Centralized error handling for clean JSON responses

// 404 for unknown routes (mount at the end of all routes)
export const notFound = (req, res, next) => {
  const err = new Error(`Not Found - ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
};

// Convert common library errors into friendly messages
function normalizeError(err) {
  // Mongoose validation / cast
  if (err.name === 'ValidationError') {
    const fields = Object.values(err.errors || {}).map(e => e.message || e.kind);
    return { code: 400, msg: `Validation failed${fields.length ? `: ${fields.join(', ')}` : ''}` };
  }
  if (err.name === 'CastError') {
    return { code: 400, msg: `Invalid ${err.path || 'value'}: ${err.value}` };
  }
  // Mongo duplicate key
  // err.code 11000 with keyValue like { invoiceNumber: "..." }
  if (err.code === 11000) {
    const key = Object.keys(err.keyValue || {})[0] || 'field';
    return { code: 409, msg: `Duplicate ${key}.` };
  }
  // JWT
  if (err.name === 'JsonWebTokenError') return { code: 401, msg: 'Invalid token.' };
  if (err.name === 'TokenExpiredError') return { code: 401, msg: 'Token expired.' };
  // Multer (file uploads)
  if (err.code === 'LIMIT_FILE_SIZE') return { code: 413, msg: 'File too large.' };
  if (err.code === 'LIMIT_FILE_COUNT') return { code: 400, msg: 'Too many files.' };
  if (err.code === 'LIMIT_UNEXPECTED_FILE') return { code: 400, msg: 'Unexpected file field.' };

  return null;
}

// Main error handler (mount after notFound)
export const errorHandler = (err, req, res, _next) => {
  const norm = normalizeError(err);
  const status = norm?.code || err.statusCode || 500;

  const payload = {
    success: false,
    message: norm?.msg || err.message || 'Server error',
  };

  // Only include stack in development
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
    // Helpful extras in dev
    if (err.keyValue) payload.keyValue = err.keyValue;
    if (err.errors) payload.errors = Object.fromEntries(
      Object.entries(err.errors).map(([k, v]) => [k, v?.message || String(v)])
    );
  }

  res.status(status).json(payload);
};
