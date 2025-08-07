// utils/invoice/generateInvoicePDF.js
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { drawHeader } from './drawHeader.js';
import { drawQRCode } from './drawQRCode.js';
import { drawShipmentTable } from './drawShipmentTable.js';

export async function generateInvoicePDF(shipment, outputPath, logoPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });

      // HEADER with logo and title
      if (logoPath) {
        doc.image(logoPath, 50, 45, { width: 100 });
      }
      doc
        .fontSize(20)
        .text('Rahman Express Post', 200, 50, { align: 'right' })
        .moveDown();

      doc
        .fontSize(14)
        .text(`Invoice #: ${shipment.invoiceNumber || 'N/A'}`, { align: 'right' })
        .text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' })
        .moveDown(2);

      // Draw horizontal line
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke();

      // SHIPMENT DETAILS (left side)
      doc
        .fontSize(16)
        .fillColor('#000')
        .text('Shipment Details', { underline: true })
        .moveDown(0.5);

      const detailsLeftX = 50;
      const detailsRightX = 300;
      let startY = doc.y;

      doc.fontSize(12);
      doc.text('Tracking ID:', detailsLeftX, startY);
      doc.text(shipment.trackingId || 'N/A', detailsRightX, startY);
      startY += 20;

      doc.text('Shipment Type:', detailsLeftX, startY);
      doc.text(shipment.shipmentType || 'N/A', detailsRightX, startY);
      startY += 20;

      doc.text('Weight:', detailsLeftX, startY);
      doc.text(`${shipment.weight ?? 'N/A'} kg`, detailsRightX, startY);
      startY += 20;

      doc.text('Price:', detailsLeftX, startY);
      doc.text(`${shipment.price ?? 'N/A'} AFN`, detailsRightX, startY);
      startY += 30;

      // SENDER INFORMATION (left side)
      doc
        .fontSize(16)
        .fillColor('#000')
        .text('Sender Information', { underline: true })
        .moveDown(0.5);

      startY = doc.y;
      doc.fontSize(12);
      doc.text('Name:', detailsLeftX, startY);
      doc.text(shipment.sender?.fullName || 'N/A', detailsRightX, startY);
      startY += 20;

      doc.text('Phone:', detailsLeftX, startY);
      doc.text(shipment.sender?.phoneNumber || 'N/A', detailsRightX, startY);
      startY += 20;

      doc.text('Email:', detailsLeftX, startY);
      doc.text(shipment.sender?.email || 'N/A', detailsRightX, startY);
      startY += 20;

      doc.text('Address:', detailsLeftX, startY);
      doc.text(shipment.sender?.address || 'N/A', detailsRightX, startY);
      startY += 20;

      doc.text('NIC:', detailsLeftX, startY);
      doc.text(shipment.sender?.nic || 'N/A', detailsRightX, startY);
      startY += 30;

      // RECEIVER INFORMATION (left side)
      doc
        .fontSize(16)
        .fillColor('#000')
        .text('Receiver Information', { underline: true })
        .moveDown(0.5);

      startY = doc.y;
      doc.fontSize(12);
      doc.text('Name:', detailsLeftX, startY);
      doc.text(shipment.receiver?.fullName || 'N/A', detailsRightX, startY);
      startY += 20;

      doc.text('Phone:', detailsLeftX, startY);
      doc.text(shipment.receiver?.phoneNumber || 'N/A', detailsRightX, startY);
      startY += 20;

      doc.text('Email:', detailsLeftX, startY);
      doc.text(shipment.receiver?.email || 'N/A', detailsRightX, startY);
      startY += 20;

      doc.text('Address:', detailsLeftX, startY);
      doc.text(shipment.receiver?.address || 'N/A', detailsRightX, startY);
      startY += 20;

      doc.text('NIC:', detailsLeftX, startY);
      doc.text(shipment.receiver?.nic || 'N/A', detailsRightX, startY);
      startY += 30;

      // FOOTER (optional)
      doc
        .fontSize(10)
        .fillColor('gray')
        .text('Thank you for choosing Rahman Express Post!', 50, 750, {
          align: 'center',
          width: 500,
        });

      // Save PDF
      doc.end();

      // Write to file and resolve when done
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}
