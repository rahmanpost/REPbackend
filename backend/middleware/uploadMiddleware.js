// backend/middleware/uploadMiddleware.js
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const UPLOAD_DIR = path.resolve(process.cwd(), 'backend', 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Safe, collision-resistant filenames
function safeFileName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const base = path
    .basename(originalName || 'file', ext)
    .replace(/[^a-z0-9_\-]+/gi, '_')
    .slice(0, 50); // keep it readable, capped
  const rand = crypto.randomBytes(6).toString('hex'); // 12 chars
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${base}_${stamp}_${rand}${ext}`;
}

// Disk storage (local). If you switch to S3 later, replace this block.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, safeFileName(file.originalname)),
});

// Allowed mimetypes per field
const ALLOWED = {
  beforePhoto: new Set(['image/jpeg', 'image/png', 'image/webp']),
  afterPhoto: new Set(['image/jpeg', 'image/png', 'image/webp']),
  receipt: new Set(['image/jpeg', 'image/png', 'application/pdf']),
};

// Validate each file by field + mimetype
function fileFilter(req, file, cb) {
  const allowed = ALLOWED[file.fieldname];
  if (!allowed) {
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
    err.message = `Unexpected field: ${file.fieldname}`;
    return cb(err);
  }
  if (!allowed.has(file.mimetype)) {
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
    err.message =
      `Invalid file type for "${file.fieldname}". ` +
      `Allowed: ${[...allowed].join(', ')}`;
    return cb(err);
  }
  cb(null, true);
}

// Global limits
const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 3,                  // we expect up to 3 fields
    fileSize: 10 * 1024 * 1024 // 10 MB per file (raise/lower as needed)
  },
});

export default upload;
