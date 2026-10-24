// Reusable form validation for CampusSphere (browser copy).
// Same rule names and messages as backend/src/validators/rules.js; the server re-validates everything.
//
//   import { bindForm, required, email, phoneIN } from '/js/validators.js';
//   bindForm(form, { email: [required(), email()] }, async (values) => { ... });
//
// bindForm gives: inline accessible errors (.field / .field__error), validate on blur and live after
// the first error, focus on the first invalid field, a loading state and double-submit protection.
const empty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const str = (v) => (typeof v === 'string' ? v.trim() : v);

export const required = (msg = 'This field is required.') => (v) => (empty(v) || v === false ? msg : null);
export const email = (msg = 'Enter a valid email address.') => (v) => (empty(v) || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(v)) && str(v).length <= 254) ? null : msg);
export const minLength = (n, msg) => (v) => (empty(v) || String(str(v)).length >= n ? null : msg || `Use at least ${n} characters.`);
export const maxLength = (n, msg) => (v) => (empty(v) || String(str(v)).length <= n ? null : msg || `Use ${n} characters or fewer.`);
export const pattern = (re, msg) => (v) => (empty(v) || re.test(str(v)) ? null : msg);
export const phoneIN = (msg = 'Enter a valid 10-digit mobile number (starting 6-9).') => (v) => {
  if (empty(v)) return null;
  const digits = String(v).replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? null : msg;
};
export const password = (msg = 'Use 8 to 128 characters with at least one letter and one number.') => (v) =>
  (empty(v) || (typeof v === 'string' && /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/.test(v)) ? null : msg);
export const intRange = (min, max, msg) => (v) => {
  if (empty(v)) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? null : msg || `Enter a whole number from ${min} to ${max}.`;
};
export const oneOf = (list, msg = 'Choose one of the available options.') => (v) => (empty(v) || list.includes(v) ? null : msg);
export const matches = (other, msg = 'Values do not match.') => (v, all) => (empty(v) || v === all[other] ? null : msg);
export const consent = (msg = 'You must agree to continue.') => (v) => (v === true || v === 'true' || v === 'on' ? null : msg);
export const dateWithin = (minDays, maxDays, msg) => (v) => {
  if (empty(v)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCMonth() !== +m[2] - 1) return 'Enter a valid date.';
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d.getTime() - today) / 86400000);
  return diff >= minDays && diff <= maxDays ? null : msg || `Choose a date within the next ${maxDays} days.`;
};
export const pastDate = (msg = 'Choose a date that is not in the future.') => (v) => {
  if (empty(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(d.getTime())) return 'Enter a valid date.';
  return d.getTime() <= Date.now() ? null : msg;
};

// Full ISO-8601 date-time ("2026-12-31T10:00" or with offset/Z). Used by the event and slot forms.
export const dateTime = (msg = 'Enter a valid date and time.') => (v) => (empty(v) || (!Number.isNaN(new Date(v).getTime()) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v))) ? null : msg);
// Absolute https URL (used for images and links). Plain http and other schemes are rejected.
export const httpsUrl = (msg = 'Enter a link starting with https://') => (v) => {
  if (empty(v)) return null;
  try { return new URL(String(v)).protocol === 'https:' && String(v).length <= 500 ? null : msg; } catch { return msg; }
};

export function validate(input, schema) {
  const errors = {};
  const values = {};
  for (const [field, rules] of Object.entries(schema)) {
    values[field] = str(input[field]);
    for (const rule of rules) {
      const message = rule(input[field] === undefined ? undefined : values[field], { ...input, ...values });
      if (message) { errors[field] = message; break; }
    }
  }
  return { errors, values, valid: Object.keys(errors).length === 0 };
}

// ---- DOM binding (only runs in a browser) ----
function readValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'submit' || el.type === 'button' || el.type === 'reset') continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ''; }
    else out[el.name] = el.value;
  }
  return out;
}

function showError(form, name, message) {
  const control = form.elements[name];
  const first = control instanceof RadioNodeList ? control[0] : control;
  if (!first) return;
  const field = first.closest('.field, .fieldset');
  const errorEl = field?.querySelector('.field__error');
  field?.classList.toggle('is-invalid', Boolean(message));
  (control instanceof RadioNodeList ? [...control] : [control]).forEach((c) => c.setAttribute('aria-invalid', message ? 'true' : 'false'));
  if (errorEl) {
    if (!errorEl.id) errorEl.id = `${name}-error`;
    errorEl.textContent = message || '';
    const ids = new Set((first.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    ids.add(errorEl.id);
    first.setAttribute('aria-describedby', [...ids].join(' '));
  }
}

export function bindForm(form, schema, onSubmit, { onServerError } = {}) {
  form.setAttribute('novalidate', '');
  let busy = false;
  const checkField = (name) => {
    const { errors } = validate(readValues(form), { [name]: schema[name] });
    showError(form, name, errors[name] || '');
    return !errors[name];
  };
  Object.keys(schema).forEach((name) => {
    const control = form.elements[name];
    if (!control) return;
    const nodes = control instanceof RadioNodeList ? [...control] : [control];
    nodes.forEach((c) => {
      c.addEventListener('blur', () => checkField(name));
      c.addEventListener('input', () => { if (c.getAttribute('aria-invalid') === 'true') checkField(name); });
      c.addEventListener('change', () => { if (c.getAttribute('aria-invalid') === 'true') checkField(name); });
    });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return; // prevents duplicate submissions
    const values = readValues(form);
    const { errors } = validate(values, schema);
    Object.keys(schema).forEach((n) => showError(form, n, errors[n] || ''));
    const firstBad = Object.keys(errors)[0];
    if (firstBad) {
      const c = form.elements[firstBad];
      (c instanceof RadioNodeList ? c[0] : c).focus();
      return;
    }
    const submit = form.querySelector('[type=submit]');
    busy = true;
    if (submit) { submit.disabled = true; submit.classList.add('is-loading'); submit.setAttribute('aria-busy', 'true'); }
    try { await onSubmit(values, form); }
    catch (err) {
      // Server-side field errors are shown inline next to the matching inputs.
      if (err?.details && typeof err.details === 'object') Object.entries(err.details).forEach(([n, m]) => showError(form, n, String(m)));
      onServerError?.(err);
    } finally {
      busy = false;
      if (submit) { submit.disabled = false; submit.classList.remove('is-loading'); submit.removeAttribute('aria-busy'); }
    }
  });
}
