export function drawShipmentTable(doc, { items = [] } = {}) {
  const startX = doc.page.margins.left;
  const tableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const cols = [
    { key: 'i', label: '#', w: 30, align: 'right' },
    { key: 'description', label: 'Description', w: tableW - 260, align: 'left' },
    { key: 'qty', label: 'Qty', w: 50, align: 'right' },
    { key: 'weightKg', label: 'Weight (kg)', w: 90, align: 'right' },
    { key: 'value', label: 'Declared Value', w: 90, align: 'right' },
  ];

  const rowH = 18;
  let y = doc.y + 4;

  // Header
  doc.font('Helvetica-Bold').fontSize(10);
  let x = startX;
  for (const c of cols) {
    doc.text(c.label, x + 4, y, { width: c.w - 8, align: c.align });
    x += c.w;
  }
  y += rowH;

  // Line under header
  doc.moveTo(startX, y - 4).lineTo(startX + tableW, y - 4).strokeColor('#aaaaaa').lineWidth(0.5).stroke();

  // Rows
  doc.font('Helvetica').fontSize(10);
  for (const r of items) {
    x = startX;
    const rowTop = y;

    for (const c of cols) {
      const text = r[c.key] ?? '';
      doc.text(String(text), x + 4, y, { width: c.w - 8, align: c.align });
      x += c.w;
    }

    y += rowH;

    // Row separators
    doc
      .moveTo(startX, y - 4)
      .lineTo(startX + tableW, y - 4)
      .strokeColor('#eeeeee')
      .lineWidth(0.5)
      .stroke();

    // Page break safety
    if (y > doc.page.height - doc.page.margins.bottom - 60) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  }

  doc.moveDown(0.5);
}
