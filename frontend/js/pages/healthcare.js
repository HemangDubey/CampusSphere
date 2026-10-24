import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, pageHead, skeletons, emptyState, errorState, qs, debounce, on, modal, fields, formError, showFormError, notice, toast, dt, label } from '../kit.js';
import { bindForm, required, minLength, maxLength, phoneIN, consent } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/healthcare', crumbs: [['Services'], ['Healthcare']] });
let services = [];

view.innerHTML = `${pageHead({ eyebrow: 'Services', title: 'Campus healthcare', lead: 'Browse services and providers, pick an available time and send an appointment request.', actions: `<a class="button button--secondary" href="${user ? '/appointments' : '/login?next=/appointments'}">My appointments</a>` })}
  <p class="disclosure" data-notice>Requests are recorded in CampusSphere and are not sent to a clinic. This is not a medical service. In an emergency call 112.</p>
  <form class="toolbar" data-filters role="search" aria-label="Find a service" novalidate>
    <div class="field field--wide"><label class="field__label" for="q">Search services or providers</label><input class="input" id="q" name="q" type="search" maxlength="60" placeholder="e.g. dental, physiotherapy"></div>
    <div class="field"><label class="field__label" for="category">Category</label><select class="select" id="category" name="category"><option value="">All categories</option></select></div><button class="button button--secondary" type="reset">Clear</button></form>
  <div class="grid grid--cards" data-list aria-live="polite"></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

const svcCard = (s) => `<article class="card" data-svc="${s.id}"><div class="chips"><span class="badge badge--muted">${esc(s.category)}</span></div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p>
  ${s.providers.length ? `<ul class="list">${s.providers.map((p) => `<li><div class="row row--between"><span><strong>${esc(p.name)}</strong><br><span class="muted small">${esc(p.speciality)} · ${p.openSlots ? `${p.openSlots} slot${p.openSlots === 1 ? '' : 's'} open` : 'no open slots'}</span></span><button class="button button--sm" type="button" data-book data-provider="${p.id}">Book</button></div></li>`).join('')}</ul>` : '<p class="small muted">No providers are listed for this service yet.</p>'}
  <button class="button button--secondary button--sm" type="button" data-book>Request without choosing a provider</button></article>`;

async function load() {
  list.innerHTML = skeletons(4);
  try {
    const data = await request(`/healthcare/services?${qs(Object.fromEntries(new FormData(filters)))}`);
    services = data.services;
    $('[data-notice]').textContent = data.notice;
    const cat = $('#category');
    if (cat.options.length === 1) cat.insertAdjacentHTML('beforeend', data.categories.map((c) => `<option>${esc(c)}</option>`).join(''));
    list.innerHTML = services.length ? services.map(svcCard).join('') : `<div style="grid-column:1/-1">${emptyState('No services match', 'Try a different search or clear the filters.')}</div>`;
  } catch (e) { list.innerHTML = `<div style="grid-column:1/-1">${errorState(e.message)}</div>`; }
}

// ---- booking dialog: slot -> details -> review -> saved reference
async function openBooking(service, providerId) {
  if (!user) { location.assign('/login?next=/healthcare'); return; }
  const provider = service.providers.find((p) => p.id === providerId) || null;
  let slots = [];
  let chosen = null;
  let values = { patientName: user.name, phone: user.phone || '' };
  const m = modal({ title: `Request: ${service.name}`, body: skeletons(1, 'skeleton-row'), wide: true });
  if (provider) {
    try { ({ slots } = await request(`/healthcare/providers/${provider.id}`)); } catch (e) { m.body.innerHTML = errorState(e.message, false); return; }
  }
  const steps = (n) => `<ol class="steps"><li class="${n === 1 ? 'is-current' : ''}">1 ${provider ? 'Time' : 'Service'}</li><li class="${n === 2 ? 'is-current' : ''}">2 Details</li><li class="${n === 3 ? 'is-current' : ''}">3 Review</li><li class="${n === 4 ? 'is-current' : ''}">4 Done</li></ol>`;

  function stepSlot() {
    if (!provider) { stepDetails(); return; }
    const byDay = {};
    slots.forEach((s) => { (byDay[new Date(s.startsAt).toDateString()] ||= []).push(s); });
    const days = Object.keys(byDay);
    m.body.innerHTML = `${steps(1)}<p><strong>${esc(provider.name)}</strong> <span class="muted small">${esc(provider.speciality)}</span></p>
      ${days.length ? `<div class="field"><label class="field__label" for="day">Date</label><select class="select" id="day" data-day>${days.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select></div><div class="slot-grid" data-slots></div><p class="field__error" data-slot-error style="display:none"></p>` : notice('info', 'This provider has no open slots right now. You can go back and send a request without a time.')}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button>${days.length ? '<button class="button" type="button" data-next>Continue</button>' : ''}</div>`;
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    if (!days.length) return;
    const drawSlots = () => {
      const day = m.body.querySelector('[data-day]').value;
      m.body.querySelector('[data-slots]').innerHTML = byDay[day].map((s) => `<button class="slot" type="button" data-slot="${s.id}" aria-pressed="${chosen === s.id}">${esc(new Date(s.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))}</button>`).join('');
    };
    m.body.querySelector('[data-day]').addEventListener('change', drawSlots);
    drawSlots();
    m.body.addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (!b) return; chosen = b.dataset.slot; drawSlots(); });
    m.body.querySelector('[data-next]').addEventListener('click', () => {
      if (!chosen) { const er = m.body.querySelector('[data-slot-error]'); er.textContent = 'Choose a time slot.'; er.style.display = 'flex'; return; }
      stepDetails();
    });
  }

  function stepDetails() {
    m.body.innerHTML = `${steps(2)}<form class="form" novalidate>${formError}${fields([{ name: 'patientName', label: 'Patient name', required: true, value: values.patientName, maxlength: 80, autocomplete: 'name' }, { name: 'phone', label: 'Contact number', type: 'tel', required: true, value: values.phone, hint: '10-digit mobile number. Shown only to healthcare administrators.', autocomplete: 'tel' }, { name: 'reason', label: 'Reason for the visit', type: 'textarea', required: true, rows: 3, value: values.reason, maxlength: 300, hint: 'Keep it brief. Do not include detailed medical history.' }, { name: 'consent', label: 'I understand this request is recorded in CampusSphere and does not book a clinic appointment.', type: 'checkbox', value: values.consent }])}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-back>Back</button><button class="button" type="submit">Review request</button></div></form>`;
    const form = m.body.querySelector('form');
    form.querySelector('[data-back]').addEventListener('click', () => (provider ? stepSlot() : m.close()));
    bindForm(form, { patientName: [required('Enter the patient name.'), minLength(2), maxLength(80)], phone: [required('Enter a contact number.'), phoneIN()], reason: [required('Briefly describe the reason for the visit.'), minLength(5), maxLength(300)], consent: [consent('Please confirm you understand how this request works.')] }, (v) => { values = v; stepReview(); });
  }

  function stepReview() {
    const slot = slots.find((s) => s.id === chosen);
    m.body.innerHTML = `${steps(3)}<div class="review-box"><dl class="kv"><dt>Service</dt><dd>${esc(service.name)}</dd><dt>Provider</dt><dd>${esc(provider?.name || 'No preference')}</dd><dt>Time</dt><dd>${slot ? esc(dt(slot.startsAt)) : 'No time requested'}</dd><dt>Patient</dt><dd>${esc(values.patientName)}</dd><dt>Reason</dt><dd>${esc(values.reason)}</dd></dl></div>
      <div data-error></div><div class="modal__actions"><button class="button button--secondary" type="button" data-back>Back</button><button class="button" type="button" data-send>Submit request</button></div>`;
    m.body.querySelector('[data-back]').addEventListener('click', stepDetails);
    const send = m.body.querySelector('[data-send]');
    send.addEventListener('click', async () => {
      send.disabled = true;
      send.classList.add('is-loading');
      try {
        const { appointment } = await request('/healthcare/appointments', { method: 'POST', body: { serviceId: service.id, providerId: provider?.id, slotId: chosen || undefined, ...values, consent: true, confirm: true } });
        m.body.innerHTML = `${steps(4)}${notice('success', 'Request recorded. It is not a confirmed clinic appointment.')}<div class="review-box"><dl class="kv"><dt>Reference</dt><dd><strong>${esc(appointment.referenceNo)}</strong></dd><dt>Status</dt><dd>${esc(label(appointment.status))}</dd>${appointment.slot ? `<dt>Time</dt><dd>${esc(dt(appointment.slot.startsAt))}</dd>` : ''}</dl></div><div class="modal__actions"><button class="button button--secondary" type="button" data-done>Close</button><a class="button" href="/appointments">My appointments</a></div>`;
        m.body.querySelector('[data-done]').addEventListener('click', m.close);
        toast('Request recorded.');
        load();
      } catch (e) {
        send.disabled = false;
        send.classList.remove('is-loading');
        if (e.code === 'SLOT_UNAVAILABLE') {
          try { ({ slots } = await request(`/healthcare/providers/${provider.id}`)); } catch { /* keep the old list */ }
          chosen = null;
          stepSlot();
          m.body.insertAdjacentHTML('afterbegin', notice('error', e.message));
          return;
        }
        if (e.code === 'VALIDATION_ERROR') { stepDetails(); showFormError(m.body.querySelector('form'), Object.values(e.details || {})[0] || e.message); return; }
        m.body.querySelector('[data-error]').innerHTML = notice('error', e.message);
      }
    });
  }
  stepSlot();
}

on(view, 'click', {
  '[data-book]': (b) => { const svc = services.find((s) => s.id === b.closest('[data-svc]').dataset.svc); openBooking(svc, b.dataset.provider); },
  '[data-retry]': load
});
filters.addEventListener('input', debounce(load, 300));
filters.addEventListener('change', load);
filters.addEventListener('reset', () => setTimeout(load));
filters.addEventListener('submit', (e) => e.preventDefault());

load();
