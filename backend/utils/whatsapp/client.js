// backend/utils/whatsapp/client.js

const {
  WHATSAPP_TOKEN = '',
  WHATSAPP_PHONE_ID = '',
  WHATSAPP_ENABLED = 'false',
} = process.env;

const API = 'https://graph.facebook.com/v21.0';

export function whatsappEnabled() {
  return WHATSAPP_ENABLED === 'true' && WHATSAPP_TOKEN && WHATSAPP_PHONE_ID;
}

export function normalizeAfPhone(raw) {
  const s = String(raw || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  // If already +93..., keep
  if (s.startsWith('+')) return s;
  // If starts with 0 and looks Afghan, replace 0 with +93
  if (s.startsWith('0')) return '+93' + s.slice(1);
  // If 9/10/11 digits and not starting with country, assume AF +93
  if (/^\d{9,11}$/.test(s)) return '+93' + s;
  return s;
}

async function sendRaw(body) {
  if (!whatsappEnabled()) return { ok: false, skipped: true, reason: 'disabled' };
  const url = `${API}/${WHATSAPP_PHONE_ID}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`WhatsApp API ${res.status}`);
    err.meta = json;
    throw err;
  }
  return json;
}

export async function sendText(toPhone, text) {
  const to = normalizeAfPhone(toPhone);
  if (!to) return { ok: false, reason: 'invalid_phone' };
  return sendRaw({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text.slice(0, 4000) },
  });
}

export async function sendDocument(toPhone, docUrl, filename = 'invoice.pdf') {
  const to = normalizeAfPhone(toPhone);
  if (!to) return { ok: false, reason: 'invalid_phone' };
  return sendRaw({
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: {
      link: docUrl,
      filename,
    },
  });
}
