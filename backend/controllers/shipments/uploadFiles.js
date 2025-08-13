import asyncHandler from 'express-async-handler';
import fs from 'fs';
import path from 'path';
import Shipment from '../../models/shipment.js';
import { isObjectId, httpError } from './_shared.js';

const BASE_UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'backend', 'uploads');

/* --------------------------- helpers --------------------------- */

// Normalize req.files regardless of .any() (array) or .fields() (object)
function normalizeFiles(req) {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') {
    const arr = [];
    for (const [k, list] of Object.entries(req.files)) {
      for (const f of list || []) arr.push({ ...f, fieldname: k });
    }
    return arr;
  }
  return [];
}

// beforePhoto / afterPhoto / receipt classifier
function classifyField(nameRaw = '') {
  const n = String(nameRaw).toLowerCase();

  // BEFORE
  if (
    n === 'beforephoto' || n === 'before' || n === 'photobefore' ||
    n === 'pickup' || n === 'pickupphoto' || n === 'start' || n === 'startphoto' ||
    /before/.test(n)
  ) return 'beforePhoto';

  // AFTER
  if (
    n === 'afterphoto' || n === 'after' || n === 'photoafter' ||
    n === 'delivery' || n === 'deliveryphoto' || n === 'end' || n === 'endphoto' ||
    /after/.test(n)
  ) return 'afterPhoto';

  // RECEIPT
  if (
    n === 'receipt' || n === 'receiptfile' || n === 'invoice' || n === 'bill' ||
    /receipt|invoice|bill/.test(n)
  ) return 'receipt';

  return null;
}

function groupFirstByCanonical(files = []) {
  const picked = { extras: [] };
  for (const f of files) {
    const canon = classifyField(f.fieldname);
    if (!canon) {
      picked.extras.push(f);
      continue;
    }
    if (!picked[canon]) picked[canon] = f; // keep first
    else picked.extras.push(f);
  }
  return picked;
}

function toFileDoc(f, userId) {
  if (!f) return null;

  // Build a web path relative to /uploads
  // Example: f.path = "<root>/backend/uploads/shipments/<id>/..."
  const relFromUploads = path.relative(BASE_UPLOAD_DIR, f.path).replace(/\\/g, '/');
  const relWeb = `/uploads/${relFromUploads}`;

  return {
    path: relWeb,
    filename: f.originalname,
    mimetype: f.mimetype,
    size: f.size,
    uploadedAt: new Date(),
    by: userId,
  };
}

function safeUnlink(storedPath) {
  try {
    if (!storedPath) return;
    // storedPath like "/uploads/shipments/<id>/file.ext"
    const rel = storedPath.startsWith('/uploads/') ? storedPath.slice('/uploads/'.length) : storedPath;
    const abs = path.join(BASE_UPLOAD_DIR, rel);
    if (abs.startsWith(BASE_UPLOAD_DIR) && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

/* --------------------------- controller --------------------------- */

export const uploadShipmentFiles = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return httpError(res, 400, 'Invalid shipment id.');

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  // IMPORTANT: Multer must run on the route via shipmentFilesFields
  // Here, we just read req.files (already parsed)
  const files = normalizeFiles(req);
  const { beforePhoto: fBefore, afterPhoto: fAfter, receipt: fReceipt, extras } =
    groupFirstByCanonical(files);

  if (!fBefore && !fAfter && !fReceipt) {
    return httpError(res, 400, 'No files uploaded. Expect fields: beforePhoto, afterPhoto, receipt.');
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

  const msgs = [];
  if (fBefore) msgs.push('beforePhoto');
  if (fAfter) msgs.push('afterPhoto');
  if (fReceipt) msgs.push('receipt');
  if (extras?.length) msgs.push(`ignored: ${extras.map(e => e.fieldname).join(', ')}`);

  shipment.logs = shipment.logs || [];
  shipment.logs.push({
    type: 'INFO',
    message: `Uploaded: ${msgs.join(', ')}`,
    at: new Date(),
    by: req.user?._id,
  });

  await shipment.save();

  return res.json({
    success: true,
    message: 'Files uploaded',
    attachments: shipment.attachments,
    shipmentId: shipment._id,
  });
});

export default uploadShipmentFiles;
