// backend/utils/invoice/enrich.js
// Builds a plain object with common pricing keys most invoice templates expect.
// If your generator needs different names, change them here (or add aliases).

export function enrichForInvoice(shipment, totalsHint = {}, opts = {}) {
  const plain =
    typeof shipment?.toObject === 'function'
      ? shipment.toObject()
      : JSON.parse(JSON.stringify(shipment || {}));

  const subtotal = Number(totalsHint.actualCharges ?? plain.actualCharges ?? 0);
  const taxAmount = Number(totalsHint.tax ?? plain.tax ?? 0);
  const other = Number(totalsHint.otherCharges ?? plain.otherCharges ?? 0);
  const total = Number(totalsHint.grandTotal ?? subtotal + taxAmount + other);

  plain.currency = plain.currency || 'AFN';

  // Standard keys (edit these names if your template expects different ones)
  plain.subtotal = subtotal;
  plain.taxAmount = taxAmount;
  plain.otherChargesAmount = other;
  plain.total = total;

  // Basic line items many templates show
  plain.items = [
    { label: 'Shipping', amount: subtotal },
    ...(other ? [{ label: 'Other charges', amount: other }] : []),
    ...(taxAmount ? [{ label: 'Tax', amount: taxAmount }] : []),
  ];

  // Optional: add alias field names your template expects, e.g.
  // enrichForInvoice(sh, hint, { aliases: { subtotal: 'totalAmount', taxAmount: 'tax' } })
  const aliases = opts.aliases || {};
  const values = { subtotal, taxAmount, otherCharges: other, total };
  for (const [stdKey, aliasName] of Object.entries(aliases)) {
    if (!aliasName) continue;
    if (stdKey in values) plain[aliasName] = values[stdKey];
  }

  return {
    plain,
    meta: {
      subtotal,
      taxAmount,
      other,
      total,
      currency: plain.currency,
      items: plain.items,
    },
  };
}
