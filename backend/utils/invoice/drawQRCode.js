// utils/invoice/drawQRCode.js
import QRCode from 'qrcode';

export async function drawQRCode(doc, trackingId, x = 400, y = 100, size = 100) {
  try {
    const qrDataURL = await QRCode.toDataURL(trackingId);

    const base64Data = qrDataURL.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    doc.image(buffer, x, y, { width: size, height: size });
  } catch (error) {
    console.error('Error generating QR code:', error);
  }
}
