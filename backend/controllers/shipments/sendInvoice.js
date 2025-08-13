import path from 'path';
import { sendInvoiceEmail } from '../../utils/mailer.js';

/**
 * Email the invoice for a shipment.
 * Pass EITHER { pdfBuffer } OR { pdfPath }. If both are provided, buffer wins.
 * - shipment: Mongoose doc (needs trackingId/_id)
 * - recipientEmail: string (customer email)
 */
export async function emailInvoiceForShipment({ shipment, recipientEmail, pdfBuffer, pdfPath }) {
  if (!shipment || !recipientEmail) {
    return { ok: false, reason: 'missing shipment or recipientEmail' };
  }

  const filename = `invoice-${shipment.trackingId || shipment._id}.pdf`;

  const attachments = pdfBuffer
    ? [{ filename, content: pdfBuffer, contentType: 'application/pdf' }]
    : pdfPath
    ? [{ filename: path.basename(pdfPath) || filename, path: pdfPath, contentType: 'application/pdf' }]
    : [];

  try {
    const res = await sendInvoiceEmail({
      to: recipientEmail,
      subject: `Your invoice${shipment.trackingId ? ` for ${shipment.trackingId}` : ''}`,
      message: `Thank you for using Rahman Express Post. Your invoice is attached.`,
      attachments,
    });
    return { ok: true, messageId: res?.messageId };
  } catch (err) {
    // don't crash business flow if mail fails
    console.error('[invoice email] failed:', err?.message || err);
    return { ok: false, reason: err?.message || String(err) };
  }
}
