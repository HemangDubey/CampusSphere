import { renderNav, renderFooter, initReveal } from './layout.js';
import { request } from './api.js';
import { esc, inr, notice } from './ui.js';
import { bindForm, required, minLength, maxLength, email, phoneIN, pattern, oneOf, consent, intRange } from './validators.js';

renderNav('/checkout');
renderFooter();
initReveal();

const $ = (s) => document.querySelector(s);
const form = $('[data-form]');
const qty = {};
let catalog = { items: [], taxRate: 0.18, fee: 20 };

// Calculation shown in the browser is a preview; the server recomputes the real totals from its own price list.
function totals() {
  const subtotal = catalog.items.reduce((s, i) => s + i.price * (qty[i.id] || 0), 0);
  const tax = Math.round(subtotal * catalog.taxRate * 100) / 100;
  const fee = subtotal ? catalog.fee : 0;
  return { subtotal, tax, fee, total: Math.round((subtotal + tax + fee) * 100) / 100 };
}

function renderTotals() {
  const t = totals();
  $('[data-totals]').innerHTML = `<div><dt>Subtotal</dt><dd>${inr(t.subtotal)}</dd></div>
    <div><dt>Tax (${Math.round(catalog.taxRate * 100)}%, illustrative)</dt><dd>${inr(t.tax)}</dd></div>
    <div><dt>Convenience fee (illustrative)</dt><dd>${inr(t.fee)}</dd></div>
    <div class="totals__grand"><dt>Total</dt><dd>${inr(t.total)}</dd></div>`;
}

function renderItems() {
  $('[data-items]').innerHTML = catalog.items.map((i) => `<div class="line">
    <div><strong>${esc(i.name)}</strong><br><span class="field__hint">${inr(i.price)} each</span></div>
    <div class="field"><label class="field__label" for="q-${i.id}">Qty</label><input class="input" id="q-${i.id}" data-qty="${i.id}" type="number" min="0" max="10" value="${qty[i.id]}" inputmode="numeric"></div>
    <div class="line__total" data-line="${i.id}">${inr(i.price * qty[i.id])}</div></div>`).join('');
  $('[data-items]').querySelectorAll('[data-qty]').forEach((el) => el.addEventListener('input', () => {
    const n = Number(el.value);
    qty[el.dataset.qty] = Number.isInteger(n) && n >= 0 && n <= 10 ? n : 0;
    el.setAttribute('aria-invalid', String(!(Number.isInteger(n) && n >= 0 && n <= 10)));
    document.querySelector(`[data-line="${el.dataset.qty}"]`).textContent = inr(catalog.items.find((i) => i.id === el.dataset.qty).price * qty[el.dataset.qty]);
    renderTotals();
  }));
  renderTotals();
}

const showError = (text) => { const b = $('[data-form-error]'); b.querySelector('p').textContent = text || ''; b.hidden = !text; };

function showResult(kind, title, message, t) {
  const box = $('[data-result]');
  box.hidden = false;
  box.innerHTML = `<h2 class="panel__title">${esc(title)}</h2>${notice(kind, message)}
    <p><span class="chip chip--demo">Demonstration only</span></p>
    ${t ? `<dl class="totals">${`<div><dt>Total (simulated)</dt><dd>${inr(t.total)}</dd></div>`}</dl>` : ''}
    <p><button class="button button--secondary" data-again>Start another demo order</button></p>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('[data-checkout]').hidden = true;
  box.querySelector('[data-again]').addEventListener('click', () => { box.hidden = true; $('[data-checkout]').hidden = false; form.reset(); showError(''); window.scrollTo({ top: 0 }); });
}

bindForm(form, {
  name: [required('Enter your name.'), minLength(2), maxLength(80)],
  email: [required('Enter your email.'), email()],
  phone: [required('Enter your mobile number.'), phoneIN()],
  address: [required('Enter your billing address.'), minLength(5), maxLength(150)],
  city: [required('Enter your city.'), maxLength(60)],
  pincode: [required('Enter your PIN code.'), pattern(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code.')],
  method: [required('Choose a payment method.'), oneOf(['upi', 'card', 'netbanking'])],
  outcome: [required('Choose a test outcome.'), oneOf(['approve', 'decline', 'cancel'])],
  consent: [consent('Please confirm you understand this is a demonstration.')]
}, async (values) => {
  showError('');
  const items = catalog.items.filter((i) => qty[i.id] > 0).map((i) => ({ id: i.id, quantity: qty[i.id] }));
  if (!items.length) { showError('Add at least one item to your order.'); return; }
  const t = totals();
  try {
    const data = await request('/checkout/demo', { method: 'POST', body: { ...values, items } });
    if (data.result === 'DEMO_CANCELLED') showResult('info', 'Checkout cancelled', 'Demonstration only: the checkout was cancelled. Nothing was charged.', null);
    else showResult('success', 'Demo order approved', 'Demonstration only: this simulated order was approved. No payment was made and nothing was charged.', data.summary);
  } catch (e) {
    if (e.code === 'DEMO_DECLINED') showResult('error', 'Demo payment declined', e.message, null);
    else throw e;
  }
}, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showError(e.message); } });

request('/checkout/catalog').then((c) => {
  catalog = c;
  c.items.forEach((i) => { qty[i.id] = i.id === 'symposium-pass' ? 1 : 0; });
  renderItems();
}).catch((e) => { $('[data-items]').innerHTML = notice('error', e.message); });
