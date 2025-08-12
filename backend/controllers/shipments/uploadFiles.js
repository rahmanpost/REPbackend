// backend/controllers/shipments/uploadFiles.js
import asyncHandler from 'express-async-handler';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import Shipment from '../../models/shipment.js';
import { isObjectId, httpError } from './_shared.js';

/* --------------------------- storage & limits --------------------------- */
const BASE_UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), 'backend', 'uploads');
const SHIPMENTS_DIR = path.join(BASE_UPLOAD_DIR, 'shipments');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
ensureDir(SHIPMENTS_DIR);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, SHIPMENTS_DIR);
  },
  filename(req, file, cb) {
    const id = req.params?.id || 'unknown';
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext && ext.length <= 6 ? ext : '';
    cb(null, `${id}-${file.fieldname}-${Date.now()}${safeExt}`);
  },
});

const allowed = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

function fileFilter(_req, file, cb) {
  if (allowed.has(file.mimetype)) return cb(null, true);
  cb(new Error('Unsupported file type'), false);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB each
}).any(); // accept any file fields; we’ll map them below

/* --------------------------- helpers & mapping --------------------------- */

function toFileDoc(f, userId) {
  if (!f) return null;
  const rel = `/uploads/shipments/${path.basename(f.path)}`; // serve statically from /uploads
  return {
    path: rel,
    filename: f.originalname,
    mimetype: f.mimetype,
    size: f.size,
    uploadedAt: new Date(),
    by: userId,
  };
}

function safeUnlink(oldPathLike) {
  try {
    if (!oldPathLike) return;
    const rel = oldPathLike.startsWith('/uploads/')
      ? oldPathLike.replace('/uploads/', '')
      : oldPathLike;
    const abs = path.join(BASE_UPLOAD_DIR, rel);
    if (abs.startsWith(BASE_UPLOAD_DIR) && fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
  } catch {
    /* ignore */
  }
}

/** classify incoming field names to canonical keys: beforePhoto / afterPhoto / receipt */
function classifyField(nameRaw = '') {
  const n = String(nameRaw).toLowerCase();

  // BEFORE
  if (
    n === 'beforephoto' ||
    n === 'before' ||
    n === 'photobefore' ||
    n === 'pickup' ||
    n === 'pickupphoto' ||
    n === 'start' ||
    n === 'startphoto' ||
    /before/.test(n)
  ) return 'beforePhoto';

  // AFTER
  if (
    n === 'afterphoto' ||
    n === 'after' ||
    n === 'photoafter' ||
    n === 'delivery' ||
    n === 'deliveryphoto' ||
    n === 'end' ||
    n === 'endphoto' ||
    /after/.test(n)
  ) return 'afterPhoto';

  // RECEIPT
  if (
    n === 'receipt' ||
    n === 'receiptfile' ||
    n === 'invoice' ||
    n === 'bill' ||
    /receipt|invoice|bill/.test(n)
  ) return 'receipt';

  // unknown
  return null;
}

function groupFirstByCanonical(files = []) {
  /** return { beforePhoto?: File, afterPhoto?: File, receipt?: File, extras: File[] } */
  const picked = { extras: [] };
  for (const f of files) {
    const canon = classifyField(f.fieldname);
    if (!canon) {
      picked.extras.push(f);
      continue;
    }
    // keep the first file for each canonical key (ignore duplicates)
    if (!picked[canon]) picked[canon] = f;
    else picked.extras.push(f);
  }
  return picked;
}

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

/* ------------------------------- controller ------------------------------ */

export const uploadShipmentFiles = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return httpError(res, 400, 'Invalid shipment id.');

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  await runUpload(req, res);

  const files = Array.isArray(req.files) ? req.files : [];
  const { beforePhoto: fBefore, afterPhoto: fAfter, receipt: fReceipt, extras } =
    groupFirstByCanonical(files);

  if (!fBefore && !fAfter && !fReceipt) {
    return httpError(
      res,
      400,
      'No files uploaded. Expect fields: beforePhoto, afterPhoto, receipt.'
    );
  }

  shipment.attachments = shipment.attachments || {};

  if (fBefore) {
    safeUnlink(shipment.attachments.beforePhoto?.path);
    shipment.attachments.beforePhoto = toFileDoc(fBefore, req.user?._id);
  }
  if (fAfter) {
    safeUnlink(shipment.attachments.afterPhoto?.path);
    shipment.attachments.afterPhoto = toFileDoc(fAfter, req.user?._id);
  }
  if (fReceipt) {
    safeUnlink(shipment.attachments.receipt?.path);
    shipment.attachments.receipt = toFileDoc(fReceipt, req.user?._id);
  }

  // Log what we accepted (extras ignored)
  const msgs = [];
  if (fBefore) msgs.push('beforePhoto');
  if (fAfter) msgs.push('afterPhoto');
  if (fReceipt) msgs.push('receipt');
  if (extras?.length) msgs.push(`ignored: ${extras.map((e) => e.fieldname).join(', ')}`);

  shipment.logs = shipment.logs || [];
  shipment.logs.push({
    type: 'INFO',
    message: `Uploaded: ${msgs.join(', ')}`,
    at: new Date(),
    by: req.user?._id,
  });

  await shipment.save();

  return res.json({ success: true, data: shipment });
});

export default uploadShipmentFiles;
