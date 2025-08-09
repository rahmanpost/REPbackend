export function drawFooter(doc, { lines = [] } = {}) {
  const y = Math.max(doc.y + 8, doc.page.height - doc.page.margins.bottom - 100);
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor('#aaaaaa').lineWidth(0.5).stroke();

  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9).fillColor('#444444');

  for (const l of lines) {
    doc.text(String(l || ''), { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' });
  }

  doc.fillColor('black');
}
