// backend/utils/generateTrackingId.js
import crypto from 'crypto';

/**
 * Generate a tracking ID like: REP-YYYYMMDD-XXXXXXXX
 * - REP = Rahman Express Post
 * - YYYYMMDD = UTC date
 * - XXXXXXXX = 8-char base64url-ish (A–Z, a–z, 0–9) random
 */
export function generateTrackingId() {
  const date = new Date();
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const randomPart = crypto
    .randomBytes(6) // 48 bits
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
    .toUpperCase();

  return `REP-${datePart}-${randomPart}`;
}

/**
 * Generate a tracking ID with collision checks.
 * Pass an async function that returns true if the ID already exists in the DB.
 *
 * @param {(id: string) => Promise<boolean>} existsById - async checker (returns true if taken)
 * @param {{ maxAttempts?: number, sleepMs?: number }} [opts]
 * @returns {Promise<string>}
 */
export async function generateTrackingIdWithRetry(existsById, opts = {}) {
  const { maxAttempts = 7, sleepMs = 0 } = opts;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const id = generateTrackingId();
    if (!(await existsById(id))) {
      return id;
    }
    if (sleepMs > 0) await new Promise(r => setTimeout(r, sleepMs));
  }

  throw new Error(
    `Failed to generate a unique tracking ID after ${maxAttempts} attempts.`
  );
}

export default generateTrackingId;
