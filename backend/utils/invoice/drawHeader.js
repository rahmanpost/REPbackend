export function drawHeader(doc, {
  companyName = '',
  companyLines = [],
  invoiceNumber = '',
  createdAt = new Date(),
  trackingId = '',
  qrBuffer = null,
} = {}) {
  const { width, margins } = doc.page;
  const pageW = width - margins.left - margins.right;

  // Company block
  doc
    .font('Helvetica-Bold').fontSize(16).text(companyName, { continued: false })
    .font('Helvetica').fontSize(10);

  for (const line of companyLines) doc.text(line);

  // Invoice meta (right side)
  const metaX = margins.left + pageW - 240;
  const metaY = margins.top;
  const lineH = 14;

  // QR (top-right)
  if (qrBuffer) {
    // 96px square QR
    doc.image(qrBuffer, metaX + 150, metaY - 6, { width: 90, height: 90 });
    doc.fontSize(8).text('Scan to track', metaX + 150, metaY + 90, { width: 90, align: 'center' });
  }

  doc
    .font('Helvetica-Bold').fontSize(12)
    .text('INVOICE', metaX, metaY, { width: 140, align: 'left' })
    .moveDown(0.2)
    .font('Helvetica').fontSize(10);

  const fmtDate = (d) =>
    new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });

  const pairs = [
    ['Invoice #', invoiceNumber],
    ['Date', fmtDate(createdAt)],
    ['Tracking ID', trackingId],
  ];

  let y = metaY + 20;
  for (const [k, v] of pairs) {
    doc.font('Helvetica-Bold').text(`${k}:`, metaX, y, { width: 70 });
    doc.font('Helvetica').text(String(v || ''), metaX + 75, y, { width: 140 });
    y += lineH;
  }

  // Separator line
  doc.moveTo(margins.left, y + 8).lineTo(margins.left + pageW, y + 8).strokeColor('#aaaaaa').lineWidth(0.5).stroke();
  doc.moveDown(1);
}
