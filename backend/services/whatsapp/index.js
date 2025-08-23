// backend/services/whatsapp/index.js
// Provider resolver with strict validation and safe errors.

import { sendViaMetaCloud } from './providers/metaCloud.js';

const PROVIDERS = Object.freeze({
  meta: sendViaMetaCloud,
});

export function getWhatsAppSender() {
  const provider = String(process.env.WHATSAPP_PROVIDER || 'meta').trim().toLowerCase();

  const impl = PROVIDERS[provider];
  if (!impl) {
    // Do not leak env details
    throw new Error('WhatsApp provider not supported or not configured');
  }
  return impl;
}
