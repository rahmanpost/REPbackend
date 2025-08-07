// utils/invoice/drawShipmentTable.js

export function drawShipmentTable(doc, shipment) {
  const leftX = 50;
  const rightX = 300;
  let y = doc.y + 10;

  // Shipment Details
  doc
    .fontSize(16)
    .fillColor('#000')
    .text('Shipment Details', leftX, y, { underline: true });
  y += 25;

  doc.fontSize(12).fillColor('#000');
  doc.text('Tracking ID:', leftX, y);
  doc.text(shipment.trackingId || 'N/A', rightX, y);
  y += 20;

  doc.text('Shipment Type:', leftX, y);
  doc.text(shipment.shipmentType || 'N/A', rightX, y);
  y += 20;

  doc.text('Weight:', leftX, y);
  doc.text(`${shipment.weight ?? 'N/A'} kg`, rightX, y);
  y += 20;

  doc.text('Price:', leftX, y);
  doc.text(`${shipment.price ?? 'N/A'} AFN`, rightX, y);
  y += 30;

  // Sender Information
  doc
    .fontSize(16)
    .fillColor('#000')
    .text('Sender Information', leftX, y, { underline: true });
  y += 25;

  doc.fontSize(12);
  doc.text('Name:', leftX, y);
  doc.text(shipment.sender?.fullName || 'N/A', rightX, y);
  y += 20;

  doc.text('Phone:', leftX, y);
  doc.text(shipment.sender?.phoneNumber || 'N/A', rightX, y);
  y += 20;

  doc.text('Email:', leftX, y);
  doc.text(shipment.sender?.email || 'N/A', rightX, y);
  y += 20;

  doc.text('Address:', leftX, y);
  doc.text(shipment.sender?.address || 'N/A', rightX, y);
  y += 20;

  doc.text('NIC:', leftX, y);
  doc.text(shipment.sender?.nic || 'N/A', rightX, y);
  y += 30;

  // Receiver Information
  doc
    .fontSize(16)
    .fillColor('#000')
    .text('Receiver Information', leftX, y, { underline: true });
  y += 25;

  doc.fontSize(12);
  doc.text('Name:', leftX, y);
  doc.text(shipment.receiver?.fullName || 'N/A', rightX, y);
  y += 20;

  doc.text('Phone:', leftX, y);
  doc.text(shipment.receiver?.phoneNumber || 'N/A', rightX, y);
  y += 20;

  doc.text('Email:', leftX, y);
  doc.text(shipment.receiver?.email || 'N/A', rightX, y);
  y += 20;

  doc.text('Address:', leftX, y);
  doc.text(shipment.receiver?.address || 'N/A', rightX, y);
  y += 20;

  doc.text('NIC:', leftX, y);
  doc.text(shipment.receiver?.nic || 'N/A', rightX, y);
  y += 30;

  doc.moveDown();
}
