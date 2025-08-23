// backend/utils/whatsapp/sendInvoice.js
// Node 20+ (global fetch). ESM.
// Exports: sendInvoiceWhatsApp({ shipment, invoiceUrl, filename, to, mode })

const GRAPH_BASE = 'https://graph.facebook.com/v22.0';

function truthy(v) { return String(v || '').toLowerCase() === 'true'; }
function asHttpsUrl(s, origin) {
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const clean = String(s).replace(/^\.?\/*/, '');
  return `${(origin || '').replace(/\/+$/, '')}/${clean}`;
}
function grandTotalFromShipment(sh) {
  const a = Number(sh?.actualCharges || 0);
  const t = Number(sh?.tax || 0);
  const o = Number(sh?.otherCharges || 0);
  return Math.round((a + t + o) * 100) / 100;
}
function pickRecipient(sh, to) {
  // Prefer explicit "to", otherwise deliveryAddress.phone, receiver.phone, or WHATSAPP_TO_TEST
  return to
    || sh?.deliveryAddress?.phone
    || sh?.receiver?.phone
    || process.env.WHATSAPP_TO_TEST
    || '';
}
function pickName(sh, name) {
  return name
    || sh?.deliveryAddress?.name
    || sh?.receiver?.name
    || 'Customer';
}

async function postGraphMessages(phoneId, token, payload) {
  const url = `${GRAPH_BASE}/${phoneId}/messages`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const raw = await r.text();
  let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
  return { ok: r.ok, status: r.status, data, payload };
}

// Send as free-form document (works only if 24h customer-service window is open)
async function sendFreeformDoc({ phoneId, token, to, link, filename }) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: { link, filename },
  };
  const res = await postGraphMessages(phoneId, token, payload);
  return { ...res, via: 'freeform' };
}

// Send via approved template with a DOCUMENT header (works for business-initiated)
async function sendTemplateDoc({ phoneId, token, to, templateName, lang, link, filename, bodyParams }) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { policy: 'deterministic', code: lang },
      components: [
        { type: 'header', parameters: [{ type: 'document', document: { link, filename } }] },
        ...(Array.isArray(bodyParams) && bodyParams.length
          ? [{ type: 'body', parameters: bodyParams.map(x => ({ type: 'text', text: String(x ?? '') })) }]
          : [])
      ],
    },
  };
  const res = await postGraphMessages(phoneId, token, payload);
  return { ...res, via: 'template' };
}

/**
 * Send an invoice PDF to WhatsApp.
 * Args:
 *  - shipment: the Shipment mongoose doc (must include invoiceNumber, trackingId, deliveryAddress{ name, phone }, charges)
 *  - invoiceUrl: absolute HTTPS URL to the PDF (or relative path resolvable via PUBLIC_APP_ORIGIN)
 *  - filename: optional "Invoice-<num>.pdf"
 *  - to: optional E.164 phone ("+93..."). If omitted, uses shipment.deliveryAddress.phone or WHATSAPP_TO_TEST
 *  - mode: "auto" (default), "freeform", or "template"
 */
export async function sendInvoiceWhatsApp({
  shipment,
  invoiceUrl,
  filename,
  to,
  mode = 'auto',
  customerName, // optional override
} = {}) {
  const enabled = truthy(process.env.WHATSAPP_ENABLED);
  if (!enabled) return { skipped: true, reason: 'WHATSAPP_ENABLED=false' };

  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, error: 'Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID' };

  // Build recipient + human fields
  const recipient = pickRecipient(shipment, to);
  if (!recipient) return { ok: false, error: 'No recipient phone (to/deliveryAddress/WHATSAPP_TO_TEST)' };

  const name = pickName(shipment, customerName);
  const invoiceNumber = String(shipment?.invoiceNumber || '');
  const trackingId = String(shipment?.trackingId || '');
  const currency = String(shipment?.currency || 'AFN').toUpperCase();
  const amount = `${grandTotalFromShipment(shipment)} ${currency}`;

  // Build a public URL to the PDF
  const publicOrigin = process.env.PUBLIC_APP_ORIGIN || '';
  const link = asHttpsUrl(invoiceUrl, publicOrigin);
  if (!/^https?:\/\//i.test(link)) {
    return { ok: false, error: 'invoiceUrl must be absolute HTTP(S) or resolvable via PUBLIC_APP_ORIGIN' };
  }
  const fname = filename || `Invoice-${invoiceNumber || trackingId || 'shipment'}.pdf`;

  // Body variables for your approved Utility template
  const templateName = process.env.WHATSAPP_TEMPLATE_INVOICE || 'rep_invoice_pdf';
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en';
  const bodyParams = [name, invoiceNumber, trackingId, amount];

  const tryFreeform = mode === 'auto' || mode === 'freeform';
  const tryTemplate = mode === 'auto' || mode === 'template';

  // 1) Try free-form doc (free if within 24h window)
  if (tryFreeform) {
    try {
      const r = await sendFreeformDoc({ phoneId, token, to: recipient, link, filename: fname });
      if (r.ok) return { ok: true, via: r.via, response: r.data };
      // If auto, fall through to template on any failure (outside 24h etc.)
      if (mode === 'freeform') return { ok: false, via: r.via, status: r.status, response: r.data };
    } catch (e) {
      if (mode === 'freeform') return { ok: false, via: 'freeform', error: e.message };
      // else continue to template
    }
  }

  // 2) Send via template (business-initiated, billable)
  if (tryTemplate) {
    try {
      const r = await sendTemplateDoc({
        phoneId, token, to: recipient, templateName, lang, link, filename: fname, bodyParams
      });
      if (r.ok) return { ok: true, via: r.via, response: r.data };
      return { ok: false, via: r.via, status: r.status, response: r.data };
    } catch (e) {
      return { ok: false, via: 'template', error: e.message };
    }
  }

  return { ok: false, error: 'Nothing sent (check mode)' };
}
