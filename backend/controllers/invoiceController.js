// backend/controllers/invoiceController.js
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

import Shipment from '../models/shipment.js';
import { generateInvoicePDF } from '../utils/invoice/generateInvoicePDF.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function friendlyFileBase(shipment) {
  return String(
    shipment?.invoiceNumber ||
      shipment?.trackingId ||
      shipment?._id ||
      'invoice'
  ).replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function isElevated(role) {
  const r = String(role || '').toUpperCase();
  return r === 'ADMIN' || r === 'AGENT';
}

/**
 * @desc   Generate (or regenerate) invoice PDF and save it to disk, return metadata
 * @route  GET /api/invoice/:id/generate
 * @access Private
 */
export const generateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid shipment id' });
    }

    const shipment = await Shipment.findById(id).lean();
    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: 'Shipment not found' });
    }

    // Owner or elevated roles
    const owner = String(shipment.sender) === String(req.user?._id);
    if (!owner && !isElevated(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Generate a fresh PDF buffer and cache it to disk
    const invoicesDir = path.join(__dirname, '../invoices');
    ensureDir(invoicesDir);

    const base = friendlyFileBase(shipment);
    const pdfPath = path.join(invoicesDir, `${base}.pdf`);

    const buf = await generateInvoicePDF(shipment); // returns Buffer with new util
    fs.writeFileSync(pdfPath, buf);

    const stat = fs.statSync(pdfPath);
    return res.json({
      success: true,
      message: 'Invoice generated',
      data: {
        shipmentId: shipment._id,
        trackingId: shipment.trackingId,
        invoiceNumber: shipment.invoiceNumber,
        file: {
          path: pdfPath,
          size: stat.size,
          mtime: stat.mtime,
        },
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('invoice generate error:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Server error', error: err.message });
  }
};

/**
 * @desc   Send invoice as a download (freshly rendered each time)
 * @route  GET /api/invoice/:id/download
 * @route  GET /api/shipments/:id/invoice   (back-compat path in your routes)
 * @route  GET /api/:id/invoice            (back-compat path in your routes)
 * @access Private
 */
export const downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid shipment id' });
    }

    const shipment = await Shipment.findById(id).lean();
    if (!shipment) {
      return res
        .status(404)
        .json({ success: false, message: 'Shipment not found' });
    }

    // Owner or elevated roles
    const owner = String(shipment.sender) === String(req.user?._id);
    if (!owner && !isElevated(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Set a friendly filename and stream the PDF directly
    const base = friendlyFileBase(shipment);
    const filename = `invoice_${base}.pdf`;

    // The new util handles piping headers when stream is provided
    await generateInvoicePDF(shipment, { stream: res, filename });
    // Nothing else to do — PDF is streamed out.
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('invoice download error:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Server error', error: err.message });
  }
};
