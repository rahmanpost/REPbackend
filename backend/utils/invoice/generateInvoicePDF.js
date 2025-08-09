import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sanitizeHtml from 'sanitize-html';
import { drawHeader } from './drawHeader.js';
import { drawShipmentTable } from './drawShipmentTable.js';
import { drawFooter } from './drawFooter.js';

/**
 * Safe text: strip tags, trim, and cap length.
 */
function safe(text, max = 300) {
  const clean = sanitizeHtml(String(text ?? ''), { allowedTags: [], allowedAttributes: {} }).trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Format money with currency code (e.g., AFN 1,250.00)
 */
function money(n = 0, currency = 'AFN') {
  const val = Number.isFinite(Number(n)) ? Number(n) : 0;
  return `${currency} ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Build a public tracking URL for the QR code.
 */
function buildTrackUrl(trackingId) {
  const base = process.env.PUBLIC_TRACK_BASE || 'http://localhost:5000/track/';
  return `${base}${encodeURIComponent(trackingId)}`;
}

/**
 * Generate an Invoice PDF.
 *
 * Usage A (stream to response):
 *   await generateInvoicePDF(shipment, { stream: res, filename: `INV-${shipment.invoiceNumber}.pdf` });
 *
 * Usage B (get a Buffer to attach to email):
 *   const buf = await generateInvoicePDF(shipment);
 *   // send buf with nodemailer, etc.
 *
 * @param {object} shipment - Mongoose doc or plain object (your shipment)
 * @param {object} [opts]
 * @param {WritableStream} [opts.stream] - If provided, pipes PDF to this stream (e.g. res)
 * @param {string} [opts.filename] - Suggested filename header if piping to HTTP response
 * @returns {Promise<Buffer|undefined>}
 */
export async function generateInvoicePDF(shipment, opts = {}) {
  const { stream, filename } = opts;

  // Normalize data from your schema
  const currency = shipment?.currency || 'AFN';
  const id = safe(shipment?.trackingId || '');
  const invoiceNo = safe(shipment?.invoiceNumber || '');
  const createdAt = shipment?.createdAt ? new Date(shipment.createdAt) : new Date();

  const sender = shipment?.from || {};
  const receiver = shipment?.to || {};
  const items = Array.isArray(shipment?.items) ? shipment.items : [];

  // Charges (fallback to 0)
  const baseCharge = shipment?.baseCharge || 0;
  const serviceCharge = shipment?.serviceCharge || 0;
  const fuelSurcharge = shipment?.fuelSurcharge || 0;
  const otherFees = shipment?.otherFees || 0;
  const isCOD = !!shipment?.isCOD;
  const codAmount = shipment?.codAmount || 0;

  const weight = shipment?.weightKg;
  const dims = shipment?.dimensionsCm || {};

  const trackUrl = id ? buildTrackUrl(id) : '';
  const qrDataUrl = trackUrl ? await QRCode.toDataURL(trackUrl, { margin: 0, width: 256 }) : null;
  const qrBuffer = qrDataUrl ? Buffer.from(qrDataUrl.split(',')[1], 'base64') : null;

  // Create doc
  const doc = new PDFDocument({ size: 'A4', margin: 36 }); // 0.5 inch margins

  // Pipe if stream provided
  let chunks = [];
  if (stream && typeof stream.setHeader === 'function') {
    // HTTP response stream
    stream.setHeader('Content-Type', 'application/pdf');
    if (filename) stream.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    doc.pipe(stream);
  } else {
    // Collect to Buffer
    doc.on('data', (c) => chunks.push(c));
  }

  // HEADER
  drawHeader(doc, {
    companyName: 'Rahman Express Post',
    companyLines: ['Kabul, Afghanistan', 'support@rahmancargo.af', '+93 xxx xxx xxx'],
    invoiceNumber: invoiceNo,
    createdAt,
    trackingId: id,
    qrBuffer, // image buffer or null
  });

  doc.moveDown(1.0);

  // Parties block
  const topY = doc.y;
  const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 10;

  doc
    .fontSize(11).font('Helvetica-Bold').text('From (Sender)', { continued: false, width: colW })
    .font('Helvetica').fontSize(10)
    .text(safe(sender.name), { width: colW })
    .text(safe(sender.phone))
    .text(`${safe(sender.street)} ${safe(sender.district)}`.trim())
    .text(`${safe(sender.province)}`)
    .text(safe(sender.details));

  doc
    .fontSize(11).font('Helvetica-Bold')
    .text('To (Receiver)', doc.x + colW + 20, topY, { width: colW })
    .font('Helvetica').fontSize(10)
    .text(safe(receiver.name), { width: colW })
    .text(safe(receiver.phone))
    .text(`${safe(receiver.street)} ${safe(receiver.district)}`.trim())
    .text(`${safe(receiver.province)}`)
    .text(safe(receiver.details));

  doc.moveDown(0.75);

  // Shipment meta
  const metaLeft = doc.x;
  doc.font('Helvetica-Bold').fontSize(11).text('Shipment Details');
  doc.font('Helvetica').fontSize(10);
  if (Number.isFinite(Number(weight))) doc.text(`Weight: ${Number(weight)} kg`);
  const hasDims = [dims.length, dims.width, dims.height].some(v => Number.isFinite(Number(v)));
  if (hasDims) doc.text(`Dimensions: ${Number(dims.length)||0} x ${Number(dims.width)||0} x ${Number(dims.height)||0} cm`);
  doc.text(`Tracking ID: ${id}`);
  doc.text(`Invoice #: ${invoiceNo}`);

  doc.moveDown(0.75);

  // ITEMS TABLE
  drawShipmentTable(doc, {
    items: items.map((it, idx) => ({
      i: idx + 1,
      description: safe(it.description, 200),
      qty: it.quantity ?? 1,
      weightKg: it.weightKg ?? 0,
      value: money(it.value, currency),
    })),
  });

  doc.moveDown(0.75);

  // CHARGES
  const chargesX = metaLeft;
  const chargesW = 260;

  doc.font('Helvetica-Bold').fontSize(11).text('Charges', chargesX, doc.y);
  doc.font('Helvetica').fontSize(10);

  const line = (label, val) => {
    const y = doc.y;
    doc.text(label, chargesX, y, { width: chargesW - 100 });
    doc.text(val, chargesX + chargesW - 100, y, { width: 100, align: 'right' });
  };
  line('Base Charge', money(baseCharge, currency));
  line('Service Charge', money(serviceCharge, currency));
  line('Fuel Surcharge', money(fuelSurcharge, currency));
  line('Other Fees', money(otherFees, currency));

  const subtotal = (Number(baseCharge) || 0) + (Number(serviceCharge) || 0) + (Number(fuelSurcharge) || 0) + (Number(otherFees) || 0);
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold');
  line('Total Payable', money(subtotal, currency));
  doc.font('Helvetica');

  if (isCOD) {
    doc.moveDown(0.2);
    line('COD Amount (collect on delivery)', money(codAmount, currency));
  }

  // FOOTER
  doc.moveDown(1.0);
  drawFooter(doc, {
    lines: [
      'Thank you for choosing Rahman Express Post.',
      'Track online with the QR code or via your dashboard.',
      'For support, contact us at support@rahmancargo.af',
    ],
  });

  // Finalize
  doc.end();

  if (!stream) {
    await new Promise((resolve) => doc.on('end', resolve));
    return Buffer.concat(chunks);
  }
  // If streamed to res, nothing to return
}
