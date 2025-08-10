// backend/utils/generateInvoiceNumber.js
import crypto from 'crypto';

function yyyymmddKabul(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date); // e.g. "2025-08-10"
  return parts.replace(/-/g, '');
}

function randBase36(len = 6) {
  const max = 36 ** len;
  const n = crypto.randomInt(0, max);
  return n.toString(36).toUpperCase().padStart(len, '0');
}

/**
 * Generate like: REP-INV-20250810-0F3XQ9
 * @param {object} opts
 * @param {(s: string)=>Promise<boolean>} isTaken async unique check
 */
export async function generateInvoiceNumber(
  { prefix = 'REP-INV', date = new Date(), len = 6, maxAttempts = 12 } = {},
  isTaken
) {
  const day = yyyymmddKabul(date);
  for (let i = 0; i < maxAttempts; i++) {
    const suffix = randBase36(len);
    const candidate = `${prefix}-${day}-${suffix}`;
    if (!isTaken) return candidate;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error('Failed to generate a unique invoice number');
}
