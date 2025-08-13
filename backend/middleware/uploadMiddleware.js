import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const BASE_UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'backend', 'uploads');
const SHIPMENTS_DIR   = path.join(BASE_UPLOAD_DIR, 'shipments');

// Ensure base folders exist
for (const dir of [BASE_UPLOAD_DIR, SHIPMENTS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Collision-resistant, readable filenames
function safeFileName(originalName, fieldname, shipmentId) {
  const ext  = path.extname(originalName || '').toLowerCase();
  const base = path
    .basename(originalName || 'file', ext)
    .replace(/[^a-z0-9_\-]+/gi, '_')
    .slice(0, 60);
  const rand  = crypto.randomBytes(6).toString('hex');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id    = String(shipmentId || 'unknown');
  return `${id}-${fieldname}-${base}-${stamp}-${rand}${ext}`;
}

// Allowed mimetypes per field
const ALLOWED = {
  beforePhoto: new Set(['image/jpeg', 'image/png', 'image/webp']),
  afterPhoto:  new Set(['image/jpeg', 'image/png', 'image/webp']),
  receipt:     new Set(['image/jpeg', 'image/png', 'application/pdf']),
};

function fileFilter(_req, file, cb) {
  const allowed = ALLOWED[file.fieldname];
  if (!allowed) {
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
    err.message = `Unexpected field: ${file.fieldname}`;
    return cb(err);
  }
  if (!allowed.has(file.mimetype)) {
    const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
    err.message = `Invalid file type for "${file.fieldname}". Allowed: ${[...allowed].join(', ')}`;
    return cb(err);
  }
  cb(null, true);
}

// Store under /uploads/shipments/<id>/
const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const id  = req.params?.id || 'misc';
    const dir = path.join(SHIPMENTS_DIR, String(id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    cb(null, safeFileName(file.originalname, file.fieldname, req.params?.id));
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 3,                   // up to 3 files total
    fileSize: 10 * 1024 * 1024, // 10MB per file
  },
});

// Use this on the route
export const shipmentFilesFields = upload.fields([
  { name: 'beforePhoto', maxCount: 1 },
  { name: 'afterPhoto',  maxCount: 1 },
  { name: 'receipt',     maxCount: 1 },
]);

export default upload;
