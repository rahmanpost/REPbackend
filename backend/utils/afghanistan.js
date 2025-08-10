// backend/utils/afghanistan.js

// 34 Afghanistan provinces (canonical)
export const AF_PROVINCES = [
  'Badakhshan','Badghis','Baghlan','Balkh','Bamyan','Daykundi',
  'Farah','Faryab','Ghazni','Ghor','Helmand','Herat','Jowzjan',
  'Kabul','Kandahar','Kapisa','Khost','Kunar','Kunduz','Laghman',
  'Logar','Nangarhar','Nimroz','Nuristan','Paktia','Paktika',
  'Panjshir','Parwan','Samangan','Sar-e Pol','Takhar','Uruzgan',
  'Wardak','Zabul',
];

const PROV_SET = new Set(AF_PROVINCES.map(p => p.toLowerCase().replace(/\s+/g,'')));

const ALIASES = {
  daikundi: 'Daykundi',
  dayanukundi: 'Daykundi',
  jawzjan: 'Jowzjan',
  saripol: 'Sar-e Pol',
  sarepol: 'Sar-e Pol',
  maidanwardak: 'Wardak',
  oruzgan: 'Uruzgan',
  uruzgan: 'Uruzgan',
};

export function normalizeProvince(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const key = raw.toLowerCase().replace(/[\s\-']/g,'');
  if (ALIASES[key]) return ALIASES[key];
  if (PROV_SET.has(key)) {
    const idx = AF_PROVINCES.findIndex(
      p => p.toLowerCase().replace(/\s+/g,'') === key
    );
    return AF_PROVINCES[idx];
  }
  return null;
}

function buildEndpointAF({ province, city, address, name, phone, email }) {
  const ep = {};
  if (province) {
    const norm = normalizeProvince(province);
    if (!norm) return { error: `Invalid province: ${province}` };
    ep.province = norm;
  }
  if (city) ep.city = String(city).trim();
  if (address) ep.address = String(address).trim();
  if (name) ep.name = String(name).trim();
  if (phone) ep.phone = String(phone).trim();
  if (email) ep.email = String(email).trim();
  return Object.keys(ep).length ? { value: ep } : { value: null };
}

/** Accept nested or flat endpoint fields; require province for both */
export function normalizeEndpointsAF(body = {}) {
  let from = (body.from && typeof body.from === 'object') ? body.from : null;
  let to   = (body.to   && typeof body.to   === 'object') ? body.to   : null;

  if (!from) {
    const { value, error } = buildEndpointAF({
      province: body.fromProvince,
      city: body.fromCity,
      address: body.fromAddress,
      name: body.fromName,
      phone: body.fromPhone,
      email: body.fromEmail,
    });
    if (error) return { error };
    from = value;
  } else if (from.province) {
    const norm = normalizeProvince(from.province);
    if (!norm) return { error: `Invalid province: ${from.province}` };
    from.province = norm;
  }

  if (!to) {
    const { value, error } = buildEndpointAF({
      province: body.toProvince,
      city: body.toCity,
      address: body.toAddress,
      name: body.toName,
      phone: body.toPhone,
      email: body.toEmail,
    });
    if (error) return { error };
    to = value;
  } else if (to.province) {
    const norm = normalizeProvince(to.province);
    if (!norm) return { error: `Invalid province: ${to.province}` };
    to.province = norm;
  }

  if (!from || !from.province) return { error: 'from.province is required (Afghanistan only).' };
  if (!to || !to.province) return { error: 'to.province is required (Afghanistan only).' };

  return { from, to };
}
