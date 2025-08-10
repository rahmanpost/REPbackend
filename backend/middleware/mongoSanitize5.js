// backend/middleware/mongoSanitize5.js
function isUnsafeKey(k, allowDots = false) {
  return k.startsWith('$') || (!allowDots && k.includes('.'));
}

function clean(obj, allowDots = false, onSanitize) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    obj.forEach((v) => clean(v, allowDots, onSanitize));
    return obj;
  }
  for (const k of Object.keys(obj)) {
    if (isUnsafeKey(k, allowDots)) {
      onSanitize && onSanitize({ key: k });
      delete obj[k];
      continue;
    }
    clean(obj[k], allowDots, onSanitize);
  }
  return obj;
}

export function mongoSanitize5({ allowDots = true, onSanitize } = {}) {
  return function (req, _res, next) {
    if (req.body && typeof req.body === 'object') clean(req.body, allowDots, onSanitize);
    if (req.params && typeof req.params === 'object') clean(req.params, allowDots, onSanitize);
    if (req.query && typeof req.query === 'object') clean(req.query, allowDots, onSanitize); // mutate only
    next();
  };
}
