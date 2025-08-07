// utils/invoice/drawHeader.js
import fs from 'fs';
import QRCode from 'qrcode';

export async function drawHeader(doc, shipment, logoPath) {
  const startX = 50;
  const startY = 45;
  const logoWidth = 100;
  const qrSize = 100;
  const gap = 20;

  // Draw logo if available
  if (logoPath && fs.existsSync(logoPath)) {
    doc.image(logoPath, startX, startY, { width: logoWidth });
  }

  // Draw QR code right beside the logo
  try {
    const qrDataURL = await QRCode.toDataURL(shipment.trackingId || 'NoID');
    const base64Data = qrDataURL.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    doc.image(buffer, startX + logoWidth + gap, startY, { width: qrSize, height: qrSize });
  } catch (err) {
    console.error('Error generating QR code in header:', err);
  }

  // Company name & invoice info on right side
  doc
    .fontSize(20)
    .text('Rahman Express Post', 300, startY, { align: 'right' })
    .moveDown();

  doc
    .fontSize(14)
    .text(`Invoice #: ${shipment.invoiceNumber || 'N/A'}`, 300, startY + 30, { align: 'right' })
    .text(`Date: ${new Date().toLocaleDateString()}`, 300, startY + 50, { align: 'right' })
    .moveDown(2);

  // Horizontal line separator below header
  doc
    .moveTo(50, startY + qrSize + 10)
    .lineTo(550, startY + qrSize + 10)
    .stroke();
}
