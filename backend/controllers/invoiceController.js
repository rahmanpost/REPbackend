// backend/controllers/invoiceController.js
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

import Shipment from '../models/shipment.js';
import { generateInvoicePDF } from '../utils/invoice/generateInvoicePDF.js';
import { sendInvoiceEmail } from '../utils/mailer.js';

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

// Pick best available email address for this shipment
function resolveInvoiceEmail(shipment, req) {
  return (
    shipment?.customerEmail ||               // if stored on shipment
    shipment?.recipientEmail ||              // alt name
    shipment?.receiver?.email ||             // embedded receiver object
    shipment?.sender?.email ||               // populated sender ref
    req.body?.email ||                       // manual override from client
    req.query?.email ||                      // manual override via query
    null
  );
}

// Load shipment with sender populated so we can use sender.email when needed
async function getShipmentWithAccessCheck(id, req) {
  if (!isObjectId(id)) {
    return { error: { code: 400, message: 'Invalid shipment id' } };
  }

  const shipment = await Shipment.findById(id)
    .populate('sender', 'email name')
    .lean();

  if (!shipment) {
    return { error: { code: 404, message: 'Shipment not found' } };
  }

  const owner = String(shipment.sender?._id || shipment.sender) === String(req.user?._id);
  if (!owner && !isElevated(req.user?.role)) {
    return { error: { code: 403, message: 'Forbidden' } };
  }

  return { shipment };
}

/**
 * @desc   Generate (or regenerate) invoice PDF and save it to disk, return metadata.
 *         If you pass ?email=1 (or true), the invoice will also be emailed to the best address we can resolve.
 * @route  GET /api/invoice/:id/generate
 * @access Private
 */
export const generateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { shipment, error } = await getShipmentWithAccessCheck(id, req);
    if (error) return res.status(error.code).json({ success: false, message: error.message });

    // Generate a fresh PDF buffer and cache it to disk
    const invoicesDir = path.join(__dirname, '../invoices');
    ensureDir(invoicesDir);

    const base = friendlyFileBase(shipment);
    const pdfPath = path.join(invoicesDir, `${base}.pdf`);

    const pdfBuffer = await generateInvoicePDF(shipment); // returns Buffer
    fs.writeFileSync(pdfPath, pdfBuffer);

    const stat = fs.statSync(pdfPath);

    // Optionally email the invoice if requested
    let emailResult = null;
    const shouldEmail = ['1', 'true', 'yes'].includes(String(req.query.email || '').toLowerCase());
    if (shouldEmail) {
      const emailTo = resolveInvoiceEmail(shipment, req);
      if (emailTo) {
        const invoiceNumber = shipment.invoiceNumber || shipment.trackingId || String(shipment._id);
        emailResult = await sendInvoiceEmail({
          to: emailTo,
          subject: `Invoice #${invoiceNumber}`,
          message: 'Thanks for shipping with us. Your invoice is attached.',
          attachments: [
            { filename: `invoice-${base}.pdf`, path: pdfPath, contentType: 'application/pdf' },
          ],
        });
      } else {
        // Log but do not fail the request
        console.warn('[invoiceController] No recipient email found; skipping email send.');
      }
    }

    return res.json({
      success: true,
      message: shouldEmail ? 'Invoice generated and email attempted' : 'Invoice generated',
      data: {
        shipmentId: shipment._id,
        trackingId: shipment.trackingId,
        invoiceNumber: shipment.invoiceNumber,
        file: {
          path: pdfPath,
          size: stat.size,
          mtime: stat.mtime,
        },
        emailedTo: emailResult ? resolveInvoiceEmail(shipment, req) : null,
        emailId: emailResult?.messageId || null,
      },
    });
  } catch (err) {
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
 * @route  GET /api/:id/invoice             (back-compat path in your routes)
 * @access Private
 */
export const downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const layout = (req.query.layout || process.env.INVOICE_LAYOUT || 'a4').toLowerCase();

    // load the shipment you want to render
    const shipment = await Shipment.findById(id)
      .populate('sender agent', 'fullName email employeeId')
      .lean();
    if (!shipment) {
      return res.status(404).json({ success: false, message: 'Shipment not found' });
    }

    // stream the PDF to the browser (no res.json afterwards)
    const filename = `invoice_${shipment.invoiceNumber || shipment.trackingId || shipment._id}.pdf`;
    await generateInvoicePDF(shipment, {
      stream: res,
      filename,
      layout,                        // 'a4' or 'thermal'
      agentId: req.user?.employeeId, // optional
      agentName: req.user?.fullName, // optional
    });
  } catch (err) {
    console.error('invoice download error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};


/**
 * @desc   Generate the invoice (in-memory) and email it (no disk write required).
 * @route  POST /api/invoice/:id/email
 * @access Private
 */
export const emailInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { shipment, error } = await getShipmentWithAccessCheck(id, req);
    if (error) return res.status(error.code).json({ success: false, message: error.message });

    const emailTo = resolveInvoiceEmail(shipment, req);
    if (!emailTo) {
      return res.status(400).json({
        success: false,
        message: 'No recipient email found. Provide ?email=<address> or include it in the body.',
      });
    }

    const pdfBuffer = await generateInvoicePDF(shipment); // Buffer
    const base = friendlyFileBase(shipment);
    const invoiceNumber = shipment.invoiceNumber || shipment.trackingId || String(shipment._id);

    const info = await sendInvoiceEmail({
      to: emailTo,
      subject: `Invoice #${invoiceNumber}`,
      message: 'Thanks for shipping with us. Your invoice is attached.',
      attachments: [
        { filename: `invoice-${base}.pdf`, content: pdfBuffer, contentType: 'application/pdf' },
      ],
    });

    return res.json({
      success: true,
      message: `Invoice emailed to ${emailTo}`,
      data: { messageId: info?.messageId || null },
    });
  } catch (err) {
    console.error('invoice email error:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Server error', error: err.message });
  }
};
