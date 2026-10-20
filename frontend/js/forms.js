// Accessible client-side validation for CampusSphere forms.
// Uses the browser's native constraint validation (required, type=email,
// minlength, pattern ...) and renders errors with the .field / .field__error
// markup from components.css. Errors are announced as text, never colour alone.
//
//   import { enhanceForm, setLoading } from '/js/forms.js';
//   enhanceForm(form, { onSubmit: async (data, form) => { ... } });

const CONTROLS = 'input:not([type=hidden]):not([type=submit]), select, textarea';

function messageFor(control) {
  const v = control.validity;
  if (v.valid) return '';
  const custom = control.dataset.error;
  if (custom) return custom;
  if (v.valueMissing) return 'This field is required.';
  if (v.typeMismatch && control.type === 'email') return 'Enter a valid email address.';
  if (v.tooShort) return `Use at least ${control.minLength} characters.`;
  if (v.patternMismatch) return control.title || 'Please match the requested format.';
  return control.validationMessage;
}

export function validateField(control) {
  const field = control.closest('.field');
  if (!field) return control.checkValidity();
  const error = field.querySelector('.field__error');
  const message = messageFor(control);
  field.classList.toggle('is-invalid', Boolean(message));
  control.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (error) {
    if (!error.id) error.id = `${control.id || control.name}-error`;
    error.textContent = message;
    const ids = new Set((control.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    ids.add(error.id);
    control.setAttribute('aria-describedby', [...ids].join(' '));
  }
  return !message;
}

export function setLoading(button, loading) {
  button.classList.toggle('is-loading', loading);
  button.disabled = loading;
  button.setAttribute('aria-busy', String(loading));
}

export function enhanceForm(form, { onSubmit } = {}) {
  form.setAttribute('novalidate', '');
  const controls = () => [...form.querySelectorAll(CONTROLS)];
  // Validate on blur, and live once a field has been flagged.
  controls().forEach((c) => {
    c.addEventListener('blur', () => validateField(c));
    c.addEventListener('input', () => { if (c.getAttribute('aria-invalid') === 'true') validateField(c); });
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const results = controls().map((c) => [c, validateField(c)]);
    const firstInvalid = results.find(([, ok]) => !ok);
    if (firstInvalid) { firstInvalid[0].focus(); return; }
    if (!onSubmit) return;
    const submit = form.querySelector('[type=submit]');
    if (submit) setLoading(submit, true);
    try { await onSubmit(Object.fromEntries(new FormData(form)), form); }
    finally { if (submit) setLoading(submit, false); }
  });
}
