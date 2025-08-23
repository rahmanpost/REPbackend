// backend/services/whatsapp/providers/metaCloud.js
// Minimal Meta WhatsApp Cloud sender with validation & sanitization.
// Requires Node 18+ (global fetch). Your environment uses Node 20+.

import { z } from 'zod';

// Basic input schema to guard the API surface.
const PayloadSchema = z.object({
  to: z.string().min(5).max(32),
  templateName: z.string().regex(/^[a-z0-9_]+$/i, 'Invalid template name'),
  variables: z.array(z.union([z.string(), z.number(), z.boolean()])).max(20).optional(),
});

// Whitelist phone characters, normalize to E.164-like (best effort).
function toE164(phone) {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

// Mask phone for logs
function maskPhone(p) {
  if (!p) return '';
  const s = String(p);
  if (s.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

const API_BASE = 'https://graph.facebook.com/v20.0';

export async function sendViaMetaCloud({ to, templateName, variables }) {
  // Validate input upfront
  const parsed = PayloadSchema.safeParse({ to, templateName, variables });
  if (!parsed.success) {
    throw new Error('Invalid WhatsApp payload');
  }

  const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_CLOUD_PHONE_ID;
  if (!token || !phoneId) {
    throw new Error('WhatsApp Cloud API credentials missing');
  }

  const recipient = toE164(parsed.data.to);
  if (!recipient) {
    throw new Error('Invalid WhatsApp recipient');
  }

  const components = [
    {
      type: 'body',
      parameters: (parsed.data.variables || []).map((v) => ({
        type: 'text',
        text: String(v ?? ''),
      })),
    },
  ];

  const payload = {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'template',
    template: {
      name: parsed.data.templateName,
      language: { code: 'en' }, // match your approved template language
      components,
    },
  };

  const url = `${API_BASE}/${encodeURIComponent(phoneId)}/messages`;

  // Timeout & safe fetch
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000); // 12s hard timeout

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    clearTimeout(timeout);
    // Avoid leaking internals
    const masked = maskPhone(recipient);
    throw new Error(`WhatsApp send failed (network) for ${masked}`);
  }
  clearTimeout(timeout);

  if (!res.ok) {
    // Avoid echoing raw provider errors to clients; still readable in server logs
    const text = await res.text().catch(() => '');
    const masked = maskPhone(recipient);
    // You can console.error(text) server-side for diagnostics if needed.
    throw new Error(`WhatsApp send failed (${res.status}) for ${masked}`);
  }

  return res.json();
}
