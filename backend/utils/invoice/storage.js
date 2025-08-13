import fs from 'fs';
import path from 'path';

const UPLOADS_ROOT = path.join(process.cwd(), 'backend', 'uploads');
const INVOICES_DIR = path.join(UPLOADS_ROOT, 'invoices');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Ensure base folders exist at load
ensureDir(UPLOADS_ROOT);
ensureDir(INVOICES_DIR);

/** Make (and return) the per-shipment invoices dir */
export function ensureInvoiceDir(shipmentId) {
  const dir = path.join(INVOICES_DIR, String(shipmentId));
  ensureDir(dir);
  return dir;
}

/** Sanitize a value for use in filenames */
function sanitize(name) {
  return String(name || '')
    .replace(/[^a-z0-9_\-\.]+/gi, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 80);
}

/** Build the invoice filename e.g. invoice-REP-2025...pdf */
export function makeInvoiceFilename(shipment) {
  const tag = sanitize(shipment?.trackingId || shipment?._id || 'invoice');
  return `invoice-${tag}.pdf`;
}

/** Absolute path where the invoice should live */
export function absoluteInvoicePath(shipment) {
  const dir = ensureInvoiceDir(shipment?._id || 'unknown');
  return path.join(dir, makeInvoiceFilename(shipment));
}

/** Save a PDF buffer to disk and return the absolute path */
export function saveInvoiceBuffer(shipment, buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('saveInvoiceBuffer: buffer must be a Buffer');
  }
  const abs = absoluteInvoicePath(shipment);
  fs.writeFileSync(abs, buffer);
  return abs;
}

/** If an invoice file already exists for this shipment, return its absolute path; else null */
export function invoiceExists(shipment) {
  const abs = absoluteInvoicePath(shipment);
  return fs.existsSync(abs) ? abs : null;
}

/** Convert an absolute path under /backend/uploads to a public /uploads/... URL */
export function toRelativeUploads(absPath) {
  const normRoot = path.resolve(UPLOADS_ROOT);
  const normAbs = path.resolve(absPath || '');
  if (!normAbs.startsWith(normRoot)) return null;
  const rel = path.relative(normRoot, normAbs).split(path.sep).join('/');
  return `/uploads/${rel}`;
}
