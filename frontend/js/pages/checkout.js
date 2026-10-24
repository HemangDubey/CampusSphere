import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, inr, pageHead, errorState, on, fields, formRow, formError, showFormError, notice, field } from '../kit.js';
import { bindForm, required, minLength, maxLength, email, phoneIN, pattern, oneOf, consent } from '../validators.js';

const view = $('[data-view]');
await initShell({ active: '/coursework', crumbs: [['Discover'], ['Coursework', '/coursework'], ['Checkout']] });
const qty = {};
let catalog = { items: [], taxRate: 0.18, fee: 20 };

view.innerHTML = `${pageHead({ eyebrow: 'Coursework', title: 'Checkout', lead: 'An order summary, billing form and payment choice. Nothing is charged and no card details are collected.' })}
  ${notice('warning', 'No payment gateway is connected: nothing is charged and no transaction is created. Tax and fees are indicative.')}
  <div class="split" data-checkout style="margin-top:16px"><section class="card" aria-labelledby="items-h"><h2 class="section-title" id="items-h">Your order</h2><div data-items></div><dl class="kv" data-totals aria-live="polite"></dl></section>
  <form class="card form" data-form novalidate aria-labelledby="d-h"><h2 class="section-title" id="d-h">Customer and billing details</h2>${formError}
    ${fields([{ name: 'name', label: 'Full name', required: true, maxlength: 80, autocomplete: 'name' }])}${formRow({ name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email' }, { name: 'phone', label: 'Mobile', type: 'tel', required: true, autocomplete: 'tel' })}
    ${fields([{ name: 'address', label: 'Billing address', required: true, maxlength: 150, autocomplete: 'street-address' }])}${formRow({ name: 'city', label: 'City', required: true, maxlength: 60 }, { name: 'pincode', label: 'PIN code', required: true, maxlength: 6, inputmode: 'numeric' })}
    ${field({ name: 'method', label: 'Payment method', type: 'radio', required: true, options: [['upi', 'UPI (no UPI ID needed)'], ['card', 'Card (no card details needed)'], ['netbanking', 'Net banking']] })}
    ${field({ name: 'outcome', label: 'Test outcome', type: 'select', required: true, options: [['approve', 'Simulate approved'], ['decline', 'Simulate declined'], ['cancel', 'Simulate cancelled']], hint: 'Lets you show each result screen.' })}
    ${field({ name: 'consent', label: 'I understand no payment is made.', type: 'checkbox' })}<button class="button button--lg" type="submit">Place order</button></form></div>
  <section class="card" data-result aria-live="polite" hidden></section>`;
const form = $('[data-form]');

function totals() {
  const subtotal = catalog.items.reduce((s, i) => s + i.price * (qty[i.id] || 0), 0);
  const tax = Math.round(subtotal * catalog.taxRate * 100) / 100;
  const fee = subtotal ? catalog.fee : 0;
  return { subtotal, tax, fee, total: Math.round((subtotal + tax + fee) * 100) / 100 };
}
function renderTotals() {
  const t = totals();
  $('[data-totals]').innerHTML = `<dt>Subtotal</dt><dd>${esc(inr(t.subtotal))}</dd><dt>Tax (${Math.round(catalog.taxRate * 100)}%, illustrative)</dt><dd>${esc(inr(t.tax))}</dd><dt>Convenience fee (illustrative)</dt><dd>${esc(inr(t.fee))}</dd><dt><strong>Total</strong></dt><dd><strong>${esc(inr(t.total))}</strong></dd>`;
}
function renderItems() {
  $('[data-items]').innerHTML = catalog.items.map((i) => `<div class="row row--between" style="padding:8px 0;border-bottom:1px solid var(--color-border)"><div><strong>${esc(i.name)}</strong><br><span class="muted small">${esc(inr(i.price))} each</span></div><div class="field" style="width:90px"><label class="field__label" for="q-${i.id}">Qty</label><input class="input" id="q-${i.id}" data-qty="${i.id}" type="number" min="0" max="10" value="${qty[i.id]}" inputmode="numeric"></div></div>`).join('');
  $('[data-items]').querySelectorAll('[data-qty]').forEach((el) => el.addEventListener('input', () => {
    const n = Number(el.value);
    const valid = Number.isInteger(n) && n >= 0 && n <= 10;
    qty[el.dataset.qty] = valid ? n : 0;
    el.setAttribute('aria-invalid', String(!valid));
    renderTotals();
  }));
  renderTotals();
}

function showResult(kind, title, message) {
  const box = $('[data-result]');
  box.hidden = false;
  box.innerHTML = `<h2 class="section-title">${esc(title)}</h2>${notice(kind, message)}<p><span class="badge badge--muted">No payment taken</span></p><p><button class="button button--secondary" type="button" data-again>Start another order</button></p>`;
  $('[data-checkout]').hidden = true;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

bindForm(form, {
  name: [required('Enter your name.'), minLength(2), maxLength(80)], email: [required('Enter your email.'), email()], phone: [required('Enter your mobile number.'), phoneIN()], address: [required('Enter your billing address.'), minLength(5), maxLength(150)],
  city: [required('Enter your city.'), maxLength(60)], pincode: [required('Enter your PIN code.'), pattern(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code.')], method: [required('Choose a payment method.'), oneOf(['upi', 'card', 'netbanking'])],
  outcome: [required('Choose a test outcome.'), oneOf(['approve', 'decline', 'cancel'])], consent: [consent('Please confirm you understand no payment is made.')]
}, async (v) => {
  showFormError(form, '');
  const items = catalog.items.filter((i) => qty[i.id] > 0).map((i) => ({ id: i.id, quantity: qty[i.id] }));
  if (!items.length) { showFormError(form, 'Add at least one item to your order.'); return; }
  try {
    const data = await request('/checkout/demo', { method: 'POST', body: { ...v, items } });
    if (data.result === 'DEMO_CANCELLED') showResult('info', 'Checkout cancelled', 'The checkout was cancelled. Nothing was charged.');
    else showResult('success', 'Order approved', `Your order was approved. No payment was made and nothing was charged. Total: ${inr(data.summary.total)}.`);
  } catch (e) { if (e.code === 'DEMO_DECLINED') showResult('error', 'Payment declined', e.message); else throw e; }
}, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });

on(view, 'click', { '[data-again]': () => { $('[data-result]').hidden = true; $('[data-checkout]').hidden = false; form.reset(); window.scrollTo({ top: 0 }); } });
request('/checkout/catalog').then((c) => { catalog = c; c.items.forEach((i) => { qty[i.id] = i.id === 'symposium-pass' ? 1 : 0; }); renderItems(); }).catch((e) => { $('[data-items]').innerHTML = errorState(e.message, false); });
