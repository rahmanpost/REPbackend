// backend/routes/invoiceRoutes.js
import express from 'express';
import fs from 'fs';

import Shipment from '../models/shipment.js';
import { protect } from '../middleware/authMiddleware.js';

// Invoice generator (supports default or named exports)
import * as invoicePDFMod from '../utils/invoice/generateInvoicePDF.js';

// Shared enrichment (maps your shipment fields to invoice-friendly aliases)
import { enrichForInvoice } from '../utils/invoice/enrich.js';

// Local storage helpers for caching the generated PDF
import {
  invoiceExists,
  saveInvoiceBuffer,
  toRelativeUploads,
  makeInvoiceFilename,
} from '../utils/invoice/storage.js';

const router = express.Router();

const genInvoice =
  (typeof invoicePDFMod === 'function' && invoicePDFMod) ||
  invoicePDFMod.default ||
  invoicePDFMod.generateInvoicePDF ||
  invoicePDFMod.generateInvoice ||
  null;

const canView = (user, shipment) => {
  const role = String(user?.role || '').toLowerCase();
  return role === 'admin' || role === 'agent' || String(shipment.sender) === String(user?._id);
};

/**
 * GET /api/invoice/:id/pdf
 * Query:
 *   - layout=a4|thermal  (default a4)
 *   - download=1         (force download; otherwise inline)
 *
 * Behavior:
 *   - Serve cached PDF if available.
 *   - Otherwise generate → cache → update shipment.attachments → return.
 */
router.get('/:id/pdf', protect, async (req, res) => {
  const { layout, download } = req.query || {};
  try {
    const sh = await Shipment.findById(req.params.id);
    if (!sh) return res.status(404).json({ success: false, message: 'Shipment not found' });
    if (!canView(req.user, sh)) return res.status(403).json({ success: false, message: 'Forbidden' });

    // 1) Serve cached file if present
    const cachedAbs = invoiceExists(sh);
    if (cachedAbs) {
      const filename = makeInvoiceFilename(sh);
      res.setHeader('Content-Type', 'application/pdf');
      const disp = String(download) === '1' ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disp}; filename="${filename}"`);
      return res.sendFile(cachedAbs);
    }

    // 2) Generate and save
    if (!genInvoice) {
      return res.status(500).json({ success: false, message: 'Invoice generator not available' });
    }

    const { plain, meta } = enrichForInvoice(sh);

    let out = await genInvoice(plain, { asBuffer: true, invoiceData: meta, layout });

    let buf =
      Buffer.isBuffer(out) ? out :
      (out?.buffer && Buffer.isBuffer(out.buffer)) ? out.buffer :
      (typeof out === 'string' ? fs.readFileSync(out) :
      (out?.path ? fs.readFileSync(out.path) : null));

    if (!buf) {
      // Fallback: call without opts
      out = await genInvoice(plain);
      buf =
        Buffer.isBuffer(out) ? out :
        (out?.buffer && Buffer.isBuffer(out.buffer)) ? out.buffer :
        (typeof out === 'string' ? fs.readFileSync(out) :
        (out?.path ? fs.readFileSync(out.path) : null));
    }

    if (!buf) {
      return res.status(500).json({ success: false, message: 'Could not generate invoice PDF' });
    }

    const savedAbs = saveInvoiceBuffer(sh, buf);

    // Update attachments so later GETs/queries return the static link
    const rel = toRelativeUploads(savedAbs);
    sh.attachments = sh.attachments || {};
    sh.attachments.invoicePdf = {
      path: rel,
      filename: makeInvoiceFilename(sh),
      mimetype: 'application/pdf',
      size: fs.statSync(savedAbs).size,
      uploadedAt: new Date(),
      by: req.user?._id,
    };
    await sh.save();

    res.setHeader('Content-Type', 'application/pdf');
    const disp2 = String(download) === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disp2}; filename="${makeInvoiceFilename(sh)}"`);
    return res.send(buf);
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Failed to generate invoice' });
  }
});

export default router;
