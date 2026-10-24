// Service request dialog built from a resource's configured form fields: fill in, review, submit, show the saved reference.
import { request } from './api.js';
import { esc, modal, field, formError, showFormError, notice, toast, dOnly } from './kit.js';
import { bindForm, required, maxLength, oneOf, pattern } from './validators.js';

function rulesFor(f) {
  const r = [];
  if (f.required) r.push(required(`${f.label} is required.`));
  if (f.type === 'select') r.push(oneOf(f.options || [], `Choose a valid ${f.label.toLowerCase()}.`));
  if (f.type === 'number') r.push(pattern(/^-?\d+(\.\d+)?$/, `${f.label} must be a number.`));
  if (f.type === 'date') r.push(pattern(/^\d{4}-\d{2}-\d{2}$/, `${f.label} must be a date.`));
  if (f.type === 'text' || f.type === 'textarea') r.push(maxLength(f.maxLength || 1000));
  return r;
}

export function openRequestForm(resource, user, onDone) {
  if (!user) { location.assign(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
  const defs = resource.formFields || [];
  let values = {};
  const m = modal({ title: `Request: ${resource.title}`, body: '' });
  const steps = (n) => `<ol class="steps"><li class="${n === 1 ? 'is-current' : ''}">1 Details</li><li class="${n === 2 ? 'is-current' : ''}">2 Review</li><li class="${n === 3 ? 'is-current' : ''}">3 Submitted</li></ol>`;

  function stepForm(serverErrors) {
    m.body.innerHTML = `${steps(1)}${resource.eligibility ? `<p class="small"><strong>Eligibility:</strong> ${esc(resource.eligibility)}</p>` : ''}${resource.requiredDocuments?.length ? `<p class="small"><strong>Bring or prepare:</strong> ${esc(resource.requiredDocuments.join(', '))}</p>` : ''}
      <form class="form" novalidate>${formError}${defs.map((f) => field({ name: f.name, label: f.label, type: f.type === 'number' ? 'number' : f.type, required: f.required, options: f.options, value: values[f.name], rows: 3, maxlength: f.maxLength })).join('')}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Review request</button></div></form>`;
    const form = m.body.querySelector('form');
    form.querySelector('[data-cancel]').addEventListener('click', m.close);
    if (serverErrors) showFormError(form, Object.values(serverErrors)[0]);
    bindForm(form, Object.fromEntries(defs.map((f) => [f.name, rulesFor(f)])), (v) => { values = v; stepReview(); });
  }

  function stepReview() {
    m.body.innerHTML = `${steps(2)}<div class="review-box"><dl class="kv">${defs.map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(f.type === 'date' && values[f.name] ? dOnly(values[f.name]) : values[f.name] || 'Not provided')}</dd>`).join('')}</dl></div>
      <div data-error></div><div class="modal__actions"><button class="button button--secondary" type="button" data-back>Back</button><button class="button" type="button" data-send>Submit request</button></div>`;
    m.body.querySelector('[data-back]').addEventListener('click', () => stepForm());
    const send = m.body.querySelector('[data-send]');
    send.addEventListener('click', async () => {
      send.disabled = true;
      send.classList.add('is-loading');
      try {
        const { request: r } = await request('/service-requests', { method: 'POST', body: { resourceId: resource.id, data: values, confirm: true } });
        stepDone(r);
      } catch (e) {
        send.disabled = false;
        send.classList.remove('is-loading');
        if (e.code === 'VALIDATION_ERROR') { stepForm(e.details); return; }
        m.body.querySelector('[data-error]').innerHTML = notice('error', e.message);
      }
    });
  }

  function stepDone(r) {
    m.body.innerHTML = `${steps(3)}${notice('success', 'Your request was submitted. This reference comes from the saved record.')}
      <div class="review-box"><dl class="kv"><dt>Reference</dt><dd><strong>${esc(r.referenceNo)}</strong></dd><dt>Status</dt><dd>${esc(r.status.replace('_', ' ').toLowerCase())}</dd></dl></div>
      <p class="small muted">Track progress, add information if staff ask for it, or cancel while it is pending.</p>
      <div class="modal__actions"><button class="button button--secondary" type="button" data-done>Close</button><a class="button" href="/requests/${r.id}">Track this request</a></div>`;
    m.body.querySelector('[data-done]').addEventListener('click', m.close);
    toast('Request submitted.');
    onDone?.(r);
  }
  stepForm();
}
