// backend/services/whatsapp/sendWhatsAppInvoice.js
// Node 20+ (global fetch). Sends a PDF invoice via WhatsApp.
// Modes: "template" | "freeform" | "auto" (try freeform then fallback to template)

const GRAPH_BASE = 'https://graph.facebook.com/v22.0';

function isTrue(v) {
  return String(v || '').toLowerCase() === 'true';
}

function makeAbsoluteUrl(pathOrUrl, origin) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const clean = String(pathOrUrl).replace(/^\.?\/*/, '');
  return `${origin.replace(/\/+$/, '')}/${clean}`;
}

/**
 * Send a WhatsApp document (free-form). Only succeeds inside a 24h service window.
 */
async function sendFreeformDoc({ token, phoneId, to, link, filename }) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: { link, filename }
  };
  const url = `${GRAPH_BASE}/${phoneId}/messages`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const raw = await r.text();
  let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
  return { ok: r.ok, status: r.status, data, payload, modeTried: 'freeform' };
}

/**
 * Send a WhatsApp template with a DOCUMENT header (works for business-initiated).
 */
async function sendTemplateDoc({ token, phoneId, to, templateName, lang, link, filename, bodyParams = [] }) {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { policy: 'deterministic', code: lang },
      components: [
        { type: 'header', parameters: [{ type: 'document', document: { link, filename } }] },
        ...(bodyParams.length
          ? [{ type: 'body', parameters: bodyParams.map(t => ({ type: 'text', text: String(t ?? '') })) }]
          : [])
      ]
    }
  };
  const url = `${GRAPH_BASE}/${phoneId}/messages`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const raw = await r.text();
  let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
  return { ok: r.ok, status: r.status, data, payload, modeTried: 'template' };
}

/**
 * Public API:
 * sendWhatsAppInvoice({
 *   to: "+93...",
 *   customerName, invoiceNumber, trackingId, amount,
 *   pdfPathOrUrl, filename,
 *   mode: "auto" | "template" | "freeform"
 * })
 */
export async function sendWhatsAppInvoice(args = {}) {
  const {
    to,
    customerName = 'Customer',
    invoiceNumber = '',
    trackingId = '',
    amount = '',
    pdfPathOrUrl = '',
    filename = '',
    mode = 'auto', // "template" | "freeform" | "auto"
    // env fallbacks
    token = process.env.WHATSAPP_TOKEN,
    phoneId = process.env.WHATSAPP_PHONE_ID,
    templateName = process.env.WHATSAPP_TEMPLATE_INVOICE || 'rep_invoice_pdf',
    lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en',
    publicOrigin = process.env.PUBLIC_APP_ORIGIN || 'http://localhost:5000',
    enabled = isTrue(process.env.WHATSAPP_ENABLED)
  } = args;

  if (!enabled) return { skipped: true, reason: 'WHATSAPP_ENABLED=false' };
  if (!token || !phoneId) return { ok: false, error: 'Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID' };
  if (!to) return { ok: false, error: 'Missing recipient "to"' };

  const link = makeAbsoluteUrl(pdfPathOrUrl, publicOrigin);
  if (!/^https?:\/\//i.test(link)) {
    return { ok: false, error: 'pdfPathOrUrl must be a public HTTP(S) URL or resolvable via PUBLIC_APP_ORIGIN' };
  }
  const fname = filename || `Invoice-${invoiceNumber || trackingId || 'shipment'}.pdf`;

  // Body variables for your Utility template
  const bodyParams = [customerName, invoiceNumber, trackingId, amount];

  // Decide strategy
  const tryFreeform = mode === 'freeform' || mode === 'auto';
  const tryTemplate = mode === 'template' || mode === 'auto';

  // 1) Try free-form document
  if (tryFreeform) {
    try {
      const res = await sendFreeformDoc({ token, phoneId, to, link, filename: fname });
      if (res.ok) return { ok: true, via: 'freeform', response: res.data };
      // If auto, fall through to template on any failure:
      if (mode === 'freeform') return { ok: false, via: 'freeform', response: res.data, status: res.status };
    } catch (e) {
      if (mode === 'freeform') return { ok: false, via: 'freeform', error: e.message };
      // else continue to template
    }
  }

  // 2) Fallback / send template with document header
  if (tryTemplate) {
    try {
      const res = await sendTemplateDoc({
        token, phoneId, to, templateName, lang, link, filename: fname, bodyParams
      });
      if (res.ok) return { ok: true, via: 'template', response: res.data };
      return { ok: false, via: 'template', response: res.data, status: res.status };
    } catch (e) {
      return { ok: false, via: 'template', error: e.message };
    }
  }

  return { ok: false, error: 'Nothing sent (check mode)' };
}
