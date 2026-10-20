// Live style guide: renders swatches from the actual CSS tokens and wires demos.
import { renderNav, renderFooter, initReveal } from './layout.js';
import { enhanceForm, setLoading } from './forms.js';

renderNav('/pages/styleguide.html');
renderFooter();
initReveal();

const SWATCHES = [
  ['Background', '--color-background'], ['Surface alt', '--color-surface-alt'],
  ['Text primary', '--color-text-primary'], ['Text secondary', '--color-text-secondary'],
  ['Accent pink', '--color-accent-pink'], ['Pink strong', '--color-accent-pink-strong'],
  ['Accent teal', '--color-accent-teal'], ['Accent ocean', '--color-accent-ocean'],
  ['Border', '--color-border'], ['Success', '--color-success'], ['Error', '--color-error'], ['Warning', '--color-warning']
];
const root = getComputedStyle(document.documentElement);
document.querySelector('[data-swatches]').innerHTML = SWATCHES.map(([name, token]) => `
  <div class="sg-swatch">
    <i style="background: var(${token})"></i>
    <div><strong>${name}</strong><code>${token}</code><code>${root.getPropertyValue(token).trim()}</code></div>
  </div>`).join('');

document.querySelector('[data-spacing]').innerHTML = ['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']
  .map((s) => `<div class="stack" style="--stack-gap:6px;align-items:center"><span style="width:var(--spacing-${s});height:var(--spacing-${s})"></span><code class="t-caption">${s}</code></div>`).join('');

const loadBtn = document.querySelector('[data-demo-loading]');
loadBtn.addEventListener('click', () => {
  setLoading(loadBtn, true);
  setTimeout(() => setLoading(loadBtn, false), 1500);
});

const result = document.querySelector('[data-demo-result]');
const form = document.querySelector('[data-demo-form]');
enhanceForm(form, {
  onSubmit: async (data) => {
    await new Promise((r) => setTimeout(r, 900));
    result.innerHTML = `<div class="notice notice--success" role="status"><span class="notice__icon" aria-hidden="true"></span><p><span class="notice__title">Saved</span>Thanks, ${data.name.replace(/[<>&"]/g, '')}. This demo form doesn't send data anywhere.</p></div>`;
  }
});
form.addEventListener('reset', () => {
  result.innerHTML = '';
  form.querySelectorAll('.field.is-invalid').forEach((f) => f.classList.remove('is-invalid'));
  form.querySelectorAll('[aria-invalid]').forEach((c) => c.setAttribute('aria-invalid', 'false'));
});
