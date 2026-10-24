// Reusable server-side validation rules. The browser copy lives in frontend/js/validators.js and
// exposes the same rule names and messages; test/rules.test.js checks both agree on shared cases.
// A rule is (value, allValues) => message | null. Rules other than required() ignore empty values.
const empty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const str = (v) => (typeof v === 'string' ? v.trim() : v);

const required = (msg = 'This field is required.') => (v) => (empty(v) || v === false ? msg : null);
const email = (msg = 'Enter a valid email address.') => (v) => (empty(v) || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(v)) && str(v).length <= 254) ? null : msg);
const minLength = (n, msg) => (v) => (empty(v) || String(str(v)).length >= n ? null : msg || `Use at least ${n} characters.`);
const maxLength = (n, msg) => (v) => (empty(v) || String(str(v)).length <= n ? null : msg || `Use ${n} characters or fewer.`);
const pattern = (re, msg) => (v) => (empty(v) || re.test(str(v)) ? null : msg);
// Indian mobile number: optional +91 / 0 prefix, 10 digits starting 6-9, spaces or dashes allowed.
const phoneIN = (msg = 'Enter a valid 10-digit mobile number (starting 6-9).') => (v) => {
  if (empty(v)) return null;
  const digits = String(v).replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? null : msg;
};
const password = (msg = 'Use 8 to 128 characters with at least one letter and one number.') => (v) =>
  (empty(v) || (typeof v === 'string' && /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/.test(v)) ? null : msg);
const intRange = (min, max, msg) => (v) => {
  if (empty(v)) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? null : msg || `Enter a whole number from ${min} to ${max}.`;
};
const oneOf = (list, msg = 'Choose one of the available options.') => (v) => (empty(v) || list.includes(v) ? null : msg);
const matches = (other, msg = 'Values do not match.') => (v, all) => (empty(v) || v === all[other] ? null : msg);
const consent = (msg = 'You must agree to continue.') => (v) => (v === true || v === 'true' || v === 'on' ? null : msg);
// Date as YYYY-MM-DD, between today+minDays and today+maxDays (inclusive), calendar-valid.
const dateWithin = (minDays, maxDays, msg) => (v) => {
  if (empty(v)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCMonth() !== +m[2] - 1) return 'Enter a valid date.';
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d.getTime() - today) / 86400000);
  return diff >= minDays && diff <= maxDays ? null : msg || `Choose a date within the next ${maxDays} days.`;
};
const pastDate = (msg = 'Choose a date that is not in the future.') => (v) => {
  if (empty(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(d.getTime())) return 'Enter a valid date.';
  return d.getTime() <= Date.now() ? null : msg;
};

// Runs every rule per field; returns { errors, values } where values are trimmed strings.
function validate(input, schema) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const values = {};
  for (const [field, rules] of Object.entries(schema)) {
    values[field] = str(body[field]);
    for (const rule of rules) {
      const message = rule(body[field] === undefined ? undefined : values[field], { ...body, ...values });
      if (message) { errors[field] = message; break; }
    }
  }
  return { errors, values, valid: Object.keys(errors).length === 0 };
}

module.exports = { required, email, minLength, maxLength, pattern, phoneIN, password, intRange, oneOf, matches, consent, dateWithin, pastDate, validate };
