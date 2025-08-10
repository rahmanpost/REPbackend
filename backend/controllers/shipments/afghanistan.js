// backend/utils/afghanistan.js

// Canonical list (34 provinces). Keep names consistent across the app.
export const AFGHAN_PROVINCES = [
  'Badakhshan',
  'Badghis',
  'Baghlan',
  'Balkh',
  'Bamyan',
  'Daykundi',
  'Farah',
  'Faryab',
  'Ghazni',
  'Ghor',
  'Helmand',
  'Herat',
  'Jowzjan',
  'Kabul',
  'Kandahar',
  'Kapisa',
  'Khost',
  'Kunar',
  'Kunduz',
  'Laghman',
  'Logar',
  'Nangarhar',
  'Nimruz',
  'Nuristan',
  'Paktia',
  'Paktika',
  'Panjshir',
  'Parwan',
  'Samangan',
  'Sar-e Pol',
  'Takhar',
  'Uruzgan',
  'Maidan Wardak',
  'Zabul',
];

// Back-compat alias if any code referenced AF_PROVINCES
export const AF_PROVINCES = AFGHAN_PROVINCES;

const key = (s) => String(s).toLowerCase().replace(/[\s\-']/g, '');

// Map of canonical keys -> canonical names
const CANON_MAP = Object.fromEntries(
  AFGHAN_PROVINCES.map((p) => [key(p), p])
);

// Common aliases & misspellings mapped to canonical names
const ALIASES = {
  daikundi: 'Daykundi',
  daikondi: 'Daykundi',
  daykundi: 'Daykundi',

  jawzjan: 'Jowzjan',

  saripol: 'Sar-e Pol',
  sarepol: 'Sar-e Pol',
  sarypol: 'Sar-e Pol',

  uruzgan: 'Uruzgan',
  oruzgan: 'Uruzgan',
  urozgan: 'Uruzgan',

  wardak: 'Maidan Wardak',
  maidanwardak: 'Maidan Wardak',

  nimroz: 'Nimruz', // allow Nimroz -> Nimruz
};

export const AFGHAN_PROVINCES_SET = new Set(Object.keys(CANON_MAP));

export function normalizeProvince(input) {
  if (!input) return null;
  const k = key(input);
  if (CANON_MAP[k]) return CANON_MAP[k];
  if (ALIASES[k]) return ALIASES[k];
  return null;
}

/**
 * Accepts nested or flat endpoint fields and enforces Afghanistan provinces.
 * Returns { from, to } on success, or { error } on failure.
 */
export function normalizeEndpointsAF(body = {}) {
  const build = ({ province, city, address, name, phone, email }) => {
    const out = {};
    if (province != null) {
      const norm = normalizeProvince(province);
      if (!norm) return { error: `Invalid province: ${province}` };
      out.province = norm;
    }
    if (city != null) out.city = String(city).trim();
    if (address != null) out.address = String(address).trim();
    if (name != null) out.name = String(name).trim();
    if (phone != null) out.phone = String(phone).trim();
    if (email != null) out.email = String(email).trim();
    return { value: Object.keys(out).length ? out : null };
  };

  let from = (body.from && typeof body.from === 'object') ? { ...body.from } : null;
  let to   = (body.to   && typeof body.to   === 'object') ? { ...body.to }   : null;

  if (!from) {
    const r = build({
      province: body.fromProvince,
      city: body.fromCity,
      address: body.fromAddress,
      name: body.fromName,
      phone: body.fromPhone,
      email: body.fromEmail,
    });
    if (r.error) return { error: r.error };
    from = r.value;
  } else if (from.province != null) {
    const norm = normalizeProvince(from.province);
    if (!norm) return { error: `Invalid province: ${from.province}` };
    from.province = norm;
  }

  if (!to) {
    const r = build({
      province: body.toProvince,
      city: body.toCity,
      address: body.toAddress,
      name: body.toName,
      phone: body.toPhone,
      email: body.toEmail,
    });
    if (r.error) return { error: r.error };
    to = r.value;
  } else if (to.province != null) {
    const norm = normalizeProvince(to.province);
    if (!norm) return { error: `Invalid province: ${to.province}` };
    to.province = norm;
  }

  if (!from || !from.province) return { error: 'from.province is required (Afghanistan only).' };
  if (!to || !to.province)     return { error: 'to.province is required (Afghanistan only).' };

  return { from, to };
}
