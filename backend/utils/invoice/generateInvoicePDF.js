import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

const {
  COMPANY_NAME = 'Rahman Express Post',
  COMPANY_CITY = 'Kabul, Afghanistan',
  COMPANY_EMAIL = 'support@rahmancargo.af',
  COMPANY_PHONE = '+93 xxx xxx xxx',
  PUBLIC_APP_ORIGIN = 'https://rahmanexpress.af',
  LOGO_PATH = 'backend/assets/logo.png',
  BRAND_COLOR = '#0e2fe9ff',

  INVOICE_LAYOUT = 'a4', // 'a4' | 'thermal'

  // A4 header icon (logo & QR) – same size
  A4_HEADER_ICON_PT = '140',
  A4_LOGO_MAX_W = '320',
  A4_LOGO_MAX_H = '100',

  // Thermal sizing
  RECEIPT_WIDTH_IN = '8',
  RECEIPT_MARGIN_PT = '24',
  LABEL_WIDTH_PT = '150',
  GAP_PT = '10',
  QR_SIZE_PT = '120',
  LOGO_SIZE_PT = '240',
} = process.env;

const TZ = 'Asia/Kabul';
const AFG_CURRENCY = 'AFN';

/* ---------- helpers ---------- */
function fmtMoney(v, currency = AFG_CURRENCY) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('en-AF', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
function fmtDateTimeKabul(d = new Date()) {
  const date = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'short', day: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
  return `${date}, ${time} AFT`;
}
function safe(v) { return (v ?? '').toString(); }
function sanitizeText(v, max = 2000) {
  if (v == null) return '';
  return String(v).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}
async function makeQR(trackUrl) {
  try {
    const dataUrl = await QRCode.toDataURL(trackUrl, { margin: 0, scale: 6 });
    return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  } catch { return null; }
}
function logoAbs() {
  return path.isAbsolute(LOGO_PATH) ? LOGO_PATH : path.join(process.cwd(), LOGO_PATH);
}
function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); }
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/**
 * Prefer enriched fields first (subtotal, taxAmount, otherChargesAmount, total),
 * then fall back to shipment native fields (actualCharges, tax, otherCharges, grandTotal).
 */
function computeMoney(shipment) {
  const hasEnriched =
    shipment &&
    (
      shipment.subtotal != null ||
      shipment.actualCharges != null ||
      shipment.taxAmount != null ||
      shipment.tax != null ||
      shipment.otherChargesAmount != null ||
      shipment.otherCharges != null ||
      shipment.total != null ||
      shipment.grandTotal != null
    );

  if (hasEnriched) {
    const subtotal = round2(Number(shipment.subtotal ?? shipment.actualCharges ?? 0));
    const other = round2(Number(shipment.otherChargesAmount ?? shipment.otherCharges ?? 0));
    const taxAmount = round2(Number(shipment.taxAmount ?? shipment.tax ?? 0));

    // discount optional
    let discountLabel = 'Discount';
    let discountAmount = 0;
    if (shipment.discount != null) {
      if (typeof shipment.discount === 'object') {
        discountLabel = shipment.discount.label || discountLabel;
        discountAmount = Number(shipment.discount.amount || 0);
      } else {
        discountAmount = Number(shipment.discount || 0);
      }
      discountAmount = Math.max(0, round2(discountAmount));
    }

    const explicitTotal = shipment.total ?? shipment.grandTotal;
    const grandTotal = round2(
      Number(explicitTotal != null ? explicitTotal : (subtotal + other + taxAmount - discountAmount))
    );

    const taxes = taxAmount ? [{ label: 'Tax', amount: taxAmount }] : [];

    return {
      currency: shipment.currency || AFG_CURRENCY,
      lineItems: [],
      priced: false,
      baseBreakdown: { baseCharge: 0, serviceCharge: 0, fuelSurcharge: 0, otherFees: 0 },
      itemsSubtotal: 0,
      subtotal,
      taxes,
      discount: { label: discountLabel, amount: discountAmount },
      grandTotal,
      codAmount: Number(shipment.codAmount || 0),
    };
  }

  // Legacy path — supports itemized + bespoke base charges
  const items = Array.isArray(shipment.items) ? shipment.items : [];
  const priced = items.some(it => it && (it.unitPrice != null || it.price != null));
  const lineItems = [];
  let itemsSubtotal = 0;

  if (priced) {
    items.forEach((it, i) => {
      const qty = Number(it.qty ?? it.quantity ?? 1);
      const unit = Number(it.unitPrice ?? it.price ?? 0);
      const total = round2(qty * unit);
      itemsSubtotal += total;
      lineItems.push({ no: i + 1, description: safe(it.description || it.name || 'Item'), qty, unit, lineTotal: total });
    });
    itemsSubtotal = round2(itemsSubtotal);
  }

  const baseCharge = Number(shipment.baseCharge || 0);
  const serviceCharge = Number(shipment.serviceCharge || 0);
  const fuelSurcharge = Number(shipment.fuelSurcharge || 0);
  const otherFees = Number(shipment.otherFees || 0);
  const baseSum = round2(baseCharge + serviceCharge + fuelSurcharge + otherFees);

  let subtotal = priced ? itemsSubtotal + baseSum : baseSum;
  subtotal = round2(subtotal);

  let taxes = [];
  if (Array.isArray(shipment.taxes) && shipment.taxes.length) {
    taxes = shipment.taxes.map(t => {
      const lbl = t.label || (t.ratePercent != null ? `Tax ${t.ratePercent}%` : 'Tax');
      const amt = t.amount != null ? Number(t.amount) : round2(subtotal * (Number(t.ratePercent) || 0) / 100);
      return { label: lbl, amount: amt };
    });
  } else if (shipment.taxPercent != null) {
    const rate = Number(shipment.taxPercent) || 0;
    taxes.push({ label: `VAT ${rate}%`, amount: round2(subtotal * rate / 100) });
  }

  let discountLabel = 'Discount';
  let discountAmount = 0;
  if (shipment.discount != null) {
    if (typeof shipment.discount === 'object') {
      discountLabel = shipment.discount.label || discountLabel;
      discountAmount = Number(shipment.discount.amount || 0);
    } else discountAmount = Number(shipment.discount || 0);
    discountAmount = Math.max(0, round2(discountAmount));
  }

  const taxesTotal = round2(sum(taxes.map(t => t.amount)));
  const grandTotal = round2(subtotal + taxesTotal - discountAmount);
  const codAmount = Number(shipment.codAmount || 0);

  return {
    currency: shipment.currency || AFG_CURRENCY,
    lineItems, priced,
    baseBreakdown: { baseCharge, serviceCharge, fuelSurcharge, otherFees },
    itemsSubtotal, subtotal, taxes,
    discount: { label: discountLabel, amount: discountAmount },
    grandTotal, codAmount,
  };
}

/* ---------------- A4 card helpers (absolute) ---------------- */
function kvAbs(doc, x, y, label, value, opts = {}) {
  const labelW = Number.isFinite(opts.labelW) ? opts.labelW : 120;
  const gap = Number.isFinite(opts.gap) ? opts.gap : 10;
  const w = Number.isFinite(opts.w) ? opts.w : 320;
  const valueW = Math.max(40, w - labelW - gap);
  const ltxt = safe(label), vtxt = safe(value || '—');

  doc.fontSize(9).fillColor('#6b7280');
  const hL = doc.heightOfString(ltxt, { width: labelW });
  doc.fontSize(10).fillColor('#111827');
  const hV = doc.heightOfString(vtxt, { width: valueW });
  const h = Math.max(hL, hV) || 12;

  doc.fontSize(9).fillColor('#6b7280').text(ltxt, x, y, { width: labelW });
  doc.fontSize(10).fillColor('#111827').text(vtxt, x + labelW + gap, y, { width: valueW });
  doc.fillColor('#000');

  const lineGap = Number.isFinite(opts.lineGap) ? opts.lineGap : 4;
  return y + h + lineGap;
}
function cardAt(doc, { x, y, w, title, pad = 12 }, builder) {
  const titleY = y;
  doc.fontSize(11).fillColor('#0f172a').text(title, x, titleY, { width: w });
  const boxTop = titleY + 16;
  const contentStart = boxTop + pad;

  let bottom = builder({
    x: x + pad,
    y: contentStart,
    w: w - pad * 2,
    kv: (lx, ly, l, v, o) =>
      kvAbs(doc, lx, ly, l, v, {
        w: Number.isFinite(o?.w) ? o.w : (w - pad * 2),
        labelW: Number.isFinite(o?.labelW) ? o.labelW : 120,
        gap: Number.isFinite(o?.gap) ? o.gap : 10,
        lineGap: Number.isFinite(o?.lineGap) ? o.lineGap : 4,
      }),
  });

  if (typeof bottom !== 'number' || !Number.isFinite(bottom)) bottom = contentStart + 24;

  const boxH = Math.max(bottom, contentStart + 24) - boxTop + pad * 0.25;
  doc.roundedRect(x, boxTop, w, boxH, 8).lineWidth(0.7).strokeColor('#e5e7eb').stroke();

  return bottom + pad * 0.5;
}

/* ---------------- A4 renderer ---------------- */
async function renderA4(doc, shipment, trackUrl, opts = {}) {
  // Pre-generate QR for header
  const qrBuf = await makeQR(trackUrl);

  // Header
  const ICON = Math.max(80, parseInt(A4_HEADER_ICON_PT, 10) || 140);
  const barH = ICON + 44;

  doc.save().rect(0, 0, doc.page.width, barH).fillColor(BRAND_COLOR).fill();

  // Logo
  const lp = logoAbs();
  const logoX = doc.page.margins.left;
  const logoY = (barH - ICON) / 2;
  doc.fillColor('#fff');
  if (fs.existsSync(lp)) {
    try { doc.image(lp, logoX, logoY, { width: ICON, height: ICON, fit: [ICON, ICON] }); }
    catch { doc.fontSize(18).text(COMPANY_NAME, logoX, logoY + ICON / 2 - 12, { width: ICON }); }
  } else {
    doc.fontSize(18).text(COMPANY_NAME, logoX, logoY + ICON / 2 - 12, { width: ICON });
  }

  // QR
  if (qrBuf) {
    const qrX = doc.page.width - doc.page.margins.right - ICON;
    const qrY = (barH - ICON) / 2;
    try { doc.image(qrBuf, qrX, qrY, { width: ICON, height: ICON }); } catch {}
  }

  // Title
  doc.fontSize(28).fillColor('#fff')
    .text('INVOICE', doc.page.margins.left, barH - 38, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'center',
    });
  doc.restore();

  // Company info
  doc.y = barH + 10;
  doc.fontSize(9).fillColor('#6b7280').text(COMPANY_NAME);
  doc.text(COMPANY_CITY);
  doc.text(`${COMPANY_EMAIL}   ${COMPANY_PHONE}`);
  doc.fillColor('#000').moveDown(0.6);

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const xLeft = doc.page.margins.left;

  // Invoice details
  const detailsBottom = cardAt(
    doc,
    { x: xLeft, y: doc.y, w: pageW, title: 'Invoice Details', pad: 12 },
    ({ x, y, w: innerW, kv }) => {
      let yy = y;
      yy = kv(x, yy, 'Invoice #', shipment.invoiceNumber || 'N/A', { w: innerW });
      yy = kv(x, yy, 'Date & Time', fmtDateTimeKabul(shipment.createdAt ? new Date(shipment.createdAt) : new Date()), { w: innerW });
      yy = kv(x, yy, 'Tracking ID', shipment.trackingId || 'N/A', { w: innerW });
      return yy;
    }
  );

  doc.y = detailsBottom + 8;

  // From / To with robust fallbacks
  const colW = Math.floor(pageW / 2) - 10;
  const rowY = doc.y;

  const leftBottom = cardAt(
    doc,
    { x: xLeft, y: rowY, w: colW, title: 'From (Sender)', pad: 12 },
    ({ x, y, w: wIn, kv }) => {
      let yy = y;
      const from = shipment.from || shipment.pickupAddress || shipment.pickup || {};
      yy = kv(x, yy, 'Name', safe(from.name || shipment.sender?.fullName), { w: wIn });
      yy = kv(x, yy, 'Address', [safe(from.line1 || from.address), safe(from.city), safe(from.province)].filter(Boolean).join(', '), { w: wIn });
      yy = kv(x, yy, 'Email', safe(shipment.sender?.email || from.email), { w: wIn });
      yy = kv(x, yy, 'Phone', safe(from.phone), { w: wIn });
      return yy;
    }
  );

  const rightBottom = cardAt(
    doc,
    { x: xLeft + colW + 20, y: rowY, w: colW, title: 'To (Receiver)', pad: 12 },
    ({ x, y, w: wIn, kv }) => {
      let yy = y;
      const to = shipment.to || shipment.deliveryAddress || shipment.delivery || {};
      yy = kv(x, yy, 'Name', safe(to.name), { w: wIn });
      yy = kv(x, yy, 'Address', [safe(to.line1 || to.address), safe(to.city), safe(to.province)].filter(Boolean).join(', '), { w: wIn });
      yy = kv(x, yy, 'Email', safe(to.email), { w: wIn });
      yy = kv(x, yy, 'Phone', safe(to.phone), { w: wIn });
      return yy;
    }
  );

  doc.y = Math.max(leftBottom, rightBottom) + 8;

  // Shipment details (+ your new fields)
  const dims = shipment.dimensionsCm || {};
  const dimStr = [dims.length, dims.width, dims.height].every(n => Number(n) > 0)
    ? `${dims.length} × ${dims.width} × ${dims.height} cm` : '—';

  // piecesTotal -> fallback: sum items[].pieces
  const piecesTotal =
    Number.isFinite(Number(shipment.piecesTotal)) && Number(shipment.piecesTotal) >= 0
      ? Number(shipment.piecesTotal)
      : Array.isArray(shipment.items)
        ? shipment.items.reduce((s, it) => s + (Number(it?.pieces) > 0 ? Number(it.pieces) : 0), 0)
        : 0;

  const declaredValue = Number.isFinite(Number(shipment.totalDeclaredValue))
    ? Number(shipment.totalDeclaredValue)
    : 0;

  const itemsDesc = sanitizeText(shipment.itemsDescription || '', 1200);
  const currency = shipment.currency || AFG_CURRENCY;
  const service = (shipment.serviceType || 'EXPRESS').toString();

  doc.y = cardAt(
    doc,
    { x: xLeft, y: doc.y, w: pageW, title: 'Shipment Details', pad: 12 },
    ({ x, y, w: innerW, kv }) => {
      const mid = Math.floor(innerW / 2) - 12;
      let y1 = y, y2 = y;

      y1 = kv(x, y1, 'Weight', `${shipment.chargeableWeightKg ?? shipment.weightKg ?? '—'} kg`, { w: mid });
      y1 = kv(x, y1, 'Dimensions', dimStr, { w: mid });
      y1 = kv(x, y1, 'Pieces', piecesTotal ? String(piecesTotal) : '—', { w: mid });

      y2 = kv(x + mid + 24, y2, 'Service', service, { w: innerW - mid - 24 });
      y2 = kv(x + mid + 24, y2, 'Total Declared Value', fmtMoney(declaredValue, currency), { w: innerW - mid - 24 });
      if (itemsDesc) y2 = kv(x + mid + 24, y2, 'Items Description', itemsDesc, { w: innerW - mid - 24 });
      if (shipment.notes) y2 = kv(x + mid + 24, y2, 'Notes', sanitizeText(shipment.notes, 2000), { w: innerW - mid - 24 });

      return Math.max(y1, y2);
    }
  ) + 8;

  // Charges (and items, if any)
  const money = computeMoney(shipment);

  if (money.priced && money.lineItems.length) {
    const x0 = xLeft, w = pageW;
    const cols = [
      { key: 'no', label: '#', width: 24, align: 'left' },
      { key: 'description', label: 'Description', width: 280, align: 'left' },
      { key: 'qty', label: 'Qty', width: 40, align: 'right' },
      { key: 'unit', label: 'Unit', width: 100, align: 'right' },
      { key: 'lineTotal', label: 'Line', width: 110, align: 'right' },
    ];
    const headY = doc.y + 2;
    doc.save().roundedRect(x0, headY, w, 24, 6).fillColor('#f3f4f6').fill();
    doc.fillColor('#374151').fontSize(10);
    let cx = x0 + 10;
    cols.forEach(c => { doc.text(c.label, cx, headY + 7, { width: c.width, align: c.align }); cx += c.width + 10; });
    doc.restore();
    doc.moveDown(1.2);
    doc.fontSize(10).fillColor('#111827');

    money.lineItems.forEach(it => {
      let cx2 = x0 + 10, y = doc.y;
      cols.forEach(c => {
        let val = it[c.key];
        if (c.key === 'unit' || c.key === 'lineTotal') val = fmtMoney(val, money.currency);
        doc.text(String(val ?? ''), cx2, y, { width: c.width, align: c.align });
        cx2 += c.width + 10;
      });
      doc.moveDown(0.4);
    });
    doc.fillColor('#000').moveDown(0.5);
  }

  {
    const x0 = xLeft, w = pageW;
    doc.save().roundedRect(x0, doc.y, w, 26, 8).fillColor(BRAND_COLOR).fill();
    doc.fillColor('#fff').fontSize(11).text('Charges', x0 + 12, doc.y - 20);
    doc.restore(); doc.moveDown(0.6);

    const r = (label, value, bold = false) => {
      const y = doc.y;
      doc.fontSize(bold ? 11 : 10).fillColor('#111827').text(label, x0 + 10, y, { width: w - 140 });
      doc.fontSize(bold ? 11 : 10).fillColor('#111827').text(fmtMoney(value, money.currency), x0, y, { width: w - 20, align: 'right' });
      doc.moveDown(0.15);
    };

    const bb = money.baseBreakdown;
    if (bb.baseCharge || bb.serviceCharge || bb.fuelSurcharge || bb.otherFees) {
      r('Base Charge', bb.baseCharge);
      r('Service Charge', bb.serviceCharge);
      r('Fuel Surcharge', bb.fuelSurcharge);
      r('Other Fees', bb.otherFees);
      const yDiv = doc.y + 4;
      doc.moveTo(x0, yDiv).lineTo(x0 + w, yDiv).lineWidth(0.6).strokeColor('#e5e7eb').stroke();
      doc.moveDown(0.3);
    }

    if (money.priced && money.itemsSubtotal) r('Items Subtotal', money.itemsSubtotal);
    r('Subtotal', money.subtotal, true);

    money.taxes.forEach(t => r(t.label, t.amount));
    if (money.discount.amount > 0) r(money.discount.label, -Math.abs(money.discount.amount));

    const yDiv2 = doc.y + 4;
    doc.moveTo(x0, yDiv2).lineTo(x0 + w, yDiv2).lineWidth(0.6).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.3);
    r('Total Payable', money.grandTotal, true);
    if ((money.codAmount || 0) > 0) r('COD Amount (collect on delivery)', money.codAmount);
  }

  // Signatures
  const col = Math.floor(pageW / 3) - 10;
  const blocks = [
    { title: 'Sender', name: safe((shipment.from || shipment.pickupAddress || {}).name || shipment.sender?.fullName || 'Sender') },
    { title: 'Receiver', name: safe((shipment.to || shipment.deliveryAddress || {}).name || 'Receiver') },
    {
      title: 'Agent',
      name: safe(opts.agentName || shipment.agent?.fullName || 'Agent'),
      extra: `Agent ID: ${opts.agentId || shipment.agentId || shipment.agent?.employeeId || shipment.agent?.code || shipment.agent?.idCard || '—'}`
    },
  ];
  const y = doc.y + 6, x0 = xLeft;
  blocks.forEach((b, i) => {
    const bx = x0 + i * (col + 15);
    const by = y;
    doc.roundedRect(bx, by, col, 96, 8).lineWidth(0.7).strokeColor('#e5e7eb').stroke();
    doc.fontSize(10).fillColor('#6b7280').text(b.title, bx + 10, by + 8);
    doc.fontSize(10).fillColor('#111827').text(b.name, bx + 10, by + 24, { width: col - 20 });
    const sigY = by + 58;
    doc.moveTo(bx + 10, sigY).lineTo(bx + col - 10, sigY).lineWidth(0.7).strokeColor('#9ca3af').stroke();
    doc.fontSize(9).fillColor('#6b7280').text('Signature', bx + 10, sigY + 4);
    const dateY = sigY + 18;
    doc.moveTo(bx + 10, dateY).lineTo(bx + col - 10, dateY).lineWidth(0.7).strokeColor('#e5e7eb').stroke();
    doc.fontSize(9).fillColor('#6b7280').text('Date', bx + 10, dateY + 4);
    if (b.extra) doc.fontSize(9).fillColor('#6b7280').text(b.extra, bx + 10, by + 42, { width: col - 20 });
  });
  doc.y = y + 110;

  doc.fontSize(9).fillColor('#9ca3af')
    .text(`© ${new Date().getFullYear()} ${COMPANY_NAME} — ${COMPANY_EMAIL} — ${COMPANY_PHONE}`, { align: 'center' })
    .fillColor('#000');
}

/* ---------------- Thermal layout ---------------- */
function hrThermal(doc, gap = 4) {
  const x0 = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = doc.y;
  doc.moveTo(x0, y).lineTo(x0 + w, y).lineWidth(0.8).strokeColor('#000').stroke();
  doc.y = y + gap;
}
function ensureThermal(doc, height, pageSize, margins) {
  const bottom = doc.page.margins.bottom;
  if (doc.y + height >= doc.page.height - bottom) {
    doc.addPage({ size: pageSize, margins });
    doc.font('Courier');
  }
}
function kvThermal(doc, label, value, labelW, gapW, right = false) {
  const xLeft = doc.page.margins.left;
  const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const xLabel = xLeft;
  const xValue = xLeft + labelW + gapW;
  const valueW = Math.max(60, contentW - labelW - gapW);
  const ltxt = safe(label);
  const vtxt = safe(value || '—');
  doc.fontSize(10).fillColor('#333');
  const hL = doc.heightOfString(ltxt, { width: labelW });
  doc.fontSize(11).fillColor('#000');
  const hV = doc.heightOfString(vtxt, { width: valueW });
  const h = Math.max(hL, hV) || 12;
  const y = doc.y;
  doc.fontSize(10).fillColor('#333').text(ltxt, xLabel, y, { width: labelW });
  doc.fontSize(11).fillColor('#000').text(vtxt, xValue, y, { width: valueW, align: right ? 'right' : 'left' });
  doc.y = y + h + 2;
}
async function renderThermal(doc, shipment, trackUrl, opts = {}) {
  const WIDTH_PT = Math.max(360, Math.round(parseFloat(RECEIPT_WIDTH_IN) * 72));
  const MARGIN_PT = Math.max(12, parseInt(RECEIPT_MARGIN_PT, 10) || 24);
  const pageSize = [WIDTH_PT, 1700];
  const margins = { top: MARGIN_PT, left: MARGIN_PT, right: MARGIN_PT, bottom: MARGIN_PT };
  const LABEL_W = Math.max(80, parseInt(LABEL_WIDTH_PT, 10) || 150);
  const GAP_W = Math.max(4, parseInt(GAP_PT, 10) || 10);
  const QR_W = Math.max(80, parseInt(QR_SIZE_PT, 10) || 120);
  const LOGO_W = Math.max(80, parseInt(LOGO_SIZE_PT, 10) || 240);

  doc.font('Courier');

  const qrBuf = await makeQR(trackUrl);

  // centered big logo
  const topY = doc.y;
  const lp = logoAbs();
  if (fs.existsSync(lp)) {
    try { const logoX = (doc.page.width - LOGO_W) / 2; doc.image(lp, logoX, topY, { width: LOGO_W, height: LOGO_W, fit: [LOGO_W, LOGO_W] }); doc.y = topY + LOGO_W + 6; }
    catch { doc.fontSize(16).text(COMPANY_NAME, { align: 'center' }); doc.moveDown(0.4); }
  } else { doc.fontSize(16).text(COMPANY_NAME, { align: 'center' }); doc.moveDown(0.4); }

  doc.fontSize(16).text('INVOICE');
  doc.fontSize(9).fillColor('#444').text(COMPANY_NAME);
  doc.text(COMPANY_CITY);
  doc.text(`${COMPANY_EMAIL}   ${COMPANY_PHONE}`).fillColor('#000');

  // QR pinned top-right
  if (qrBuf) {
    const qrX = doc.page.width - doc.page.margins.right - QR_W;
    const qrY = MARGIN_PT;
    try {
      doc.image(qrBuf, qrX, qrY, { width: QR_W, height: QR_W });
      doc.fontSize(8).fillColor('#444').text('Scan to track', qrX, qrY + QR_W + 2, { width: QR_W, align: 'center' }).fillColor('#000');
    } catch {}
  }

  hrThermal(doc, 6);

  const invNo = shipment.invoiceNumber || 'N/A';
  const issuedAt = fmtDateTimeKabul(shipment.createdAt ? new Date(shipment.createdAt) : new Date());
  const trackingId = shipment.trackingId || 'N/A';
  kvThermal(doc, 'Invoice #', invNo, LABEL_W, GAP_W);
  kvThermal(doc, 'Date & Time', issuedAt, LABEL_W, GAP_W);
  kvThermal(doc, 'Tracking ID', trackingId, LABEL_W, GAP_W);

  hrThermal(doc, 6);

  const fromSrc = shipment.from || shipment.pickupAddress || shipment.pickup || {};
  const toSrc = shipment.to || shipment.deliveryAddress || shipment.delivery || {};
  doc.fontSize(12).text('From (Sender)'); doc.moveDown(0.2);
  kvThermal(doc, 'Name:', safe(fromSrc.name || shipment.sender?.fullName), LABEL_W, GAP_W);
  kvThermal(doc, 'Address:', [safe(fromSrc.line1 || fromSrc.address), safe(fromSrc.city), safe(fromSrc.province)].filter(Boolean).join(', '), LABEL_W, GAP_W);
  kvThermal(doc, 'Email:', safe(shipment.sender?.email || fromSrc.email), LABEL_W, GAP_W);
  kvThermal(doc, 'Phone:', safe(fromSrc.phone), LABEL_W, GAP_W);

  doc.moveDown(0.3);
  doc.fontSize(12).text('To (Receiver)'); doc.moveDown(0.2);
  kvThermal(doc, 'Name:', safe(toSrc.name), LABEL_W, GAP_W);
  kvThermal(doc, 'Address:', [safe(toSrc.line1 || toSrc.address), safe(toSrc.city), safe(toSrc.province)].filter(Boolean).join(', '), LABEL_W, GAP_W);
  kvThermal(doc, 'Email:', safe(toSrc.email), LABEL_W, GAP_W);
  kvThermal(doc, 'Phone:', safe(toSrc.phone), LABEL_W, GAP_W);

  hrThermal(doc, 6);

  const dims = shipment.dimensionsCm || {};
  const dimStr = [dims.length, dims.width, dims.height].every(n => Number(n) > 0)
    ? `${dims.length} × ${dims.width} × ${dims.height} cm` : '—';

  const piecesTotal =
    Number.isFinite(Number(shipment.piecesTotal)) && Number(shipment.piecesTotal) >= 0
      ? Number(shipment.piecesTotal)
      : Array.isArray(shipment.items)
        ? shipment.items.reduce((s, it) => s + (Number(it?.pieces) > 0 ? Number(it.pieces) : 0), 0)
        : 0;

  const declaredValue = Number.isFinite(Number(shipment.totalDeclaredValue))
    ? Number(shipment.totalDeclaredValue)
    : 0;

  const itemsDesc = sanitizeText(shipment.itemsDescription || '', 600);
  const currency = shipment.currency || AFG_CURRENCY;
  const service = (shipment.serviceType || 'EXPRESS').toString();

  doc.fontSize(12).text('Shipment Details'); doc.moveDown(0.2);
  kvThermal(doc, 'Weight:', `${shipment.chargeableWeightKg ?? shipment.weightKg ?? '—'} kg`, LABEL_W, GAP_W);
  kvThermal(doc, 'Dimensions:', dimStr, LABEL_W, GAP_W);
  kvThermal(doc, 'Pieces:', piecesTotal ? String(piecesTotal) : '—', LABEL_W, GAP_W);
  kvThermal(doc, 'Service:', service, LABEL_W, GAP_W);
  kvThermal(doc, 'Total Declared Value:', fmtMoney(declaredValue, currency), LABEL_W, GAP_W);
  if (itemsDesc) kvThermal(doc, 'Items:', itemsDesc, LABEL_W, GAP_W);
  if (shipment.notes) kvThermal(doc, 'Notes:', sanitizeText(shipment.notes, 2000), LABEL_W, GAP_W);

  hrThermal(doc, 6);

  const money = computeMoney(shipment);
  if (money.priced && money.lineItems.length) {
    doc.fontSize(12).text('Items'); doc.moveDown(0.2);
    money.lineItems.forEach(it => {
      doc.fontSize(10).text(`${it.no}. ${it.description}`);
      doc.fontSize(10).text(`   Qty: ${it.qty}   Unit: ${fmtMoney(it.unit, money.currency)}   Line: ${fmtMoney(it.lineTotal, money.currency)}`);
      doc.moveDown(0.2);
    });
    hrThermal(doc, 4);
  }

  const bb = money.baseBreakdown;
  doc.fontSize(12).text('Charges'); doc.moveDown(0.2);
  if (bb.baseCharge || bb.serviceCharge || bb.fuelSurcharge || bb.otherFees) {
    kvThermal(doc, 'Base Charge:', fmtMoney(bb.baseCharge, money.currency), LABEL_W, GAP_W, true);
    kvThermal(doc, 'Service Charge:', fmtMoney(bb.serviceCharge, money.currency), LABEL_W, GAP_W, true);
    kvThermal(doc, 'Fuel Surcharge:', fmtMoney(bb.fuelSurcharge, money.currency), LABEL_W, GAP_W, true);
    kvThermal(doc, 'Other Fees:', fmtMoney(bb.otherFees, money.currency), LABEL_W, GAP_W, true);
    hrThermal(doc, 4);
  }
  if (money.priced && money.itemsSubtotal) kvThermal(doc, 'Items Subtotal:', fmtMoney(money.itemsSubtotal, money.currency), LABEL_W, GAP_W, true);
  kvThermal(doc, 'Subtotal:', fmtMoney(money.subtotal, money.currency), LABEL_W, GAP_W, true);
  money.taxes.forEach(t => kvThermal(doc, `${t.label}:`, fmtMoney(t.amount, money.currency), LABEL_W, GAP_W, true));
  if (money.discount.amount > 0) kvThermal(doc, `${money.discount.label}:`, `-${fmtMoney(money.discount.amount, money.currency)}`, LABEL_W, GAP_W, true);
  hrThermal(doc, 4);
  kvThermal(doc, 'Total Payable:', fmtMoney(money.grandTotal, money.currency), LABEL_W, GAP_W, true);
  if ((money.codAmount || 0) > 0) kvThermal(doc, 'COD Amount:', fmtMoney(money.codAmount, money.currency), LABEL_W, GAP_W, true);

  hrThermal(doc, 8);

  const box = (title, name, extra) => {
    ensureThermal(doc, 96, pageSize, margins);
    doc.fontSize(10).fillColor('#333').text(title);
    doc.fillColor('#000').fontSize(11).text(name || '—');
    hrThermal(doc, 0); doc.fontSize(9).fillColor('#444').text('Signature'); doc.moveDown(0.6);
    hrThermal(doc, 0); doc.fontSize(9).fillColor('#444').text('Date'); doc.moveDown(extra ? 0.6 : 0.4);
    if (extra) { hrThermal(doc, 0); doc.fontSize(9).fillColor('#444').text(extra); doc.moveDown(0.8); }
    doc.fillColor('#000');
  };
  const senderName = safe((fromSrc.name || shipment.sender?.fullName || 'Sender'));
  const receiverName = safe((toSrc.name || 'Receiver'));
  const agentName = safe(opts.agentName || shipment.agent?.fullName || 'Agent');
  const agentId = opts.agentId || shipment.agentId || shipment.agent?.employeeId || shipment.agent?.code || shipment.agent?.idCard || '—';
  box('Sender', senderName);
  box('Receiver', receiverName);
  box('Agent', `${agentName} (ID: ${agentId})`, 'Agent ID');

  hrThermal(doc, 6);
  doc.fontSize(9).fillColor('#444')
    .text(`Thank you for choosing ${COMPANY_NAME}. Track via QR or your dashboard.`)
    .text(`${COMPANY_EMAIL}   ${COMPANY_PHONE}`).fillColor('#000');
}

/* ---------------- entry ---------------- */
export async function generateInvoicePDF(shipment, options = {}) {
  if (!shipment) throw new Error('generateInvoicePDF: shipment is required');

  const base = (PUBLIC_APP_ORIGIN || '').replace(/\/$/, '');
  const trackUrl = `${base}/track/${encodeURIComponent(shipment.trackingId || '')}`;
  const layout = (options.layout || INVOICE_LAYOUT || 'a4').toLowerCase();

  const doc =
    layout === 'thermal'
      ? new PDFDocument({
          size: [Math.max(360, Math.round(parseFloat(RECEIPT_WIDTH_IN) * 72)), 1700],
          margins: {
            top: Math.max(12, parseInt(RECEIPT_MARGIN_PT, 10) || 24),
            left: Math.max(12, parseInt(RECEIPT_MARGIN_PT, 10) || 24),
            right: Math.max(12, parseInt(RECEIPT_MARGIN_PT, 10) || 24),
            bottom: Math.max(12, parseInt(RECEIPT_MARGIN_PT, 10) || 24),
          },
          info: { Title: `Invoice ${shipment.invoiceNumber || ''}`, Author: COMPANY_NAME },
        })
      : new PDFDocument({
          size: 'A4',
          margins: { top: 36, left: 36, right: 36, bottom: 36 },
          info: { Title: `Invoice ${shipment.invoiceNumber || ''}`, Author: COMPANY_NAME },
        });

  const chunks = [];
  let resolveBuf, rejectBuf;
  const pdfPromise = new Promise((res, rej) => { resolveBuf = res; rejectBuf = rej; });

  if (options.stream) {
    const filename = options.filename || `invoice_${shipment.invoiceNumber || 'document'}.pdf`;
    if (options.stream.setHeader) {
      options.stream.setHeader('Content-Type', 'application/pdf');
      options.stream.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    }
    doc.pipe(options.stream);
  } else {
    doc.on('data', (d) => chunks.push(d));
    doc.on('end', () => resolveBuf(Buffer.concat(chunks)));
  }
  doc.on('error', (e) => rejectBuf?.(e));

  if (layout === 'thermal') {
    await renderThermal(doc, shipment, trackUrl, { agentId: options.agentId, agentName: options.agentName });
  } else {
    await renderA4(doc, shipment, trackUrl, { agentId: options.agentId, agentName: options.agentName });
  }

  doc.end();
  return options.stream ? null : pdfPromise;
}

// default export for resilience with your import logic
export default generateInvoicePDF;
