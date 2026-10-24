import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dt, label, badge, sample, pageHead, skeletons, emptyState, errorState, pager, table, qs, debounce, on, modal, field, fields, formError, showFormError, toast, timelineHtml, notice, attempt, confirmDialog, tabs } from '../kit.js';
import { bindForm, required, minLength, maxLength, intRange, pattern } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/admin/healthcare', crumbs: [['Administration'], ['Healthcare Management']], requireAuth: true });
if (!user.permissions.includes('healthcare:manage')) { view.innerHTML = pageHead({ title: 'Healthcare management', eyebrow: 'Restricted' }) + notice('error', 'Only healthcare administrators can manage appointments and services.'); await new Promise(() => {}); }

view.innerHTML = `${pageHead({ eyebrow: 'Administration', title: 'Healthcare management', lead: 'Review appointment requests, and manage the demonstration services, providers and availability.' })}<div data-tabs></div><div data-panel></div>`;
const panel = $('[data-panel]');
const state = { page: 1, appts: [], services: [] };

// ---------------------------------------------------------------- appointments
async function appointments() {
  panel.innerHTML = `<form class="toolbar" data-f role="search" novalidate><div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" placeholder="Reference, patient or service" maxlength="60"></div>
    ${field({ name: 'status', label: 'Status', type: 'select', placeholder: 'Any status', options: ['REQUESTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'COMPLETED', 'CANCELLED', 'REJECTED'].map((s) => [s, label(s)]), value: 'REQUESTED' })}${field({ name: 'date', label: 'Appointment date', type: 'date' })}<button class="button button--secondary" type="reset">Clear</button></form>
    <div data-counts class="chips"></div><div data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
  const f = panel.querySelector('[data-f]');
  const list = panel.querySelector('[data-list]');
  const draw = async () => {
    list.innerHTML = skeletons(4, 'skeleton-row');
    try {
      const data = await request(`/manage/healthcare/appointments?${qs({ ...Object.fromEntries(new FormData(f)), page: state.page })}`);
      state.appts = data.appointments;
      panel.querySelector('[data-counts]').innerHTML = Object.entries(data.counts).map(([s, n]) => `<span class="badge badge--muted">${esc(label(s))}: ${n}</span>`).join('');
      list.innerHTML = data.appointments.length ? table([
        { label: 'Reference', html: (a) => `<strong>${esc(a.referenceNo)}</strong><br><span class="muted small">${esc(dt(a.createdAt))}</span>` },
        { label: 'Patient', html: (a) => `${esc(a.patientName)}<br><span class="muted small">${esc(a.phone)}</span>` },
        { label: 'Service', html: (a) => `${esc(a.service.name)}<br><span class="muted small">${esc(a.provider?.name || 'No provider')}${a.slot ? ` · ${esc(dt(a.slot.startsAt))}` : ''}</span>` },
        { label: 'Status', html: (a) => badge(a.status) }, { label: '', html: (a) => `<button class="button button--sm" type="button" data-open="${a.id}">Open</button>` }
      ], data.appointments) : emptyState('No appointment requests', 'Nothing matches these filters.');
      pager(panel.querySelector('[data-pager]'), data, (p) => { state.page = p; draw(); });
    } catch (e) { list.innerHTML = errorState(e.message); }
  };
  const reload = () => { state.page = 1; draw(); };
  f.addEventListener('input', debounce(reload, 300));
  f.addEventListener('change', reload);
  f.addEventListener('reset', () => setTimeout(reload));
  f.addEventListener('submit', (e) => e.preventDefault());
  panel.dataset.reload = 'appointments';
  draw();
}

async function openAppt(id) {
  const m = modal({ title: 'Appointment request', body: skeletons(1, 'skeleton-row'), wide: true });
  try {
    const { appointment: a, history } = await request(`/manage/healthcare/appointments/${id}`);
    const next = { REQUESTED: [['CONFIRMED', 'Confirm'], ['REJECTED', 'Reject'], ['CANCELLED', 'Cancel']], RESCHEDULE_REQUESTED: [['CONFIRMED', 'Confirm new time'], ['REJECTED', 'Reject'], ['CANCELLED', 'Cancel']], CONFIRMED: [['COMPLETED', 'Mark completed'], ['CANCELLED', 'Cancel']] }[a.status] || [];
    m.body.innerHTML = `<div class="split"><div class="stack"><div class="row">${badge(a.status)}<span class="muted small">${esc(a.referenceNo)}</span></div><dl class="kv"><dt>Patient</dt><dd>${esc(a.patientName)}</dd><dt>Contact</dt><dd>${esc(a.phone)}</dd><dt>Service</dt><dd>${esc(a.service.name)}</dd><dt>Provider</dt><dd>${esc(a.provider?.name || 'No preference')}</dd><dt>Time</dt><dd>${a.slot ? esc(dt(a.slot.startsAt)) : 'No time requested'}</dd><dt>Reason</dt><dd>${esc(a.reason)}</dd></dl><h4 class="section-title">History</h4>${timelineHtml(history)}</div>
      <div>${next.length ? `<form class="form" novalidate>${formError}${field({ name: 'note', label: 'Note / reason', type: 'textarea', rows: 3, maxlength: 300, hint: 'Required when rejecting or cancelling. The patient will see it.' })}<div class="stack">${next.map(([to, t]) => `<button class="button ${['REJECTED', 'CANCELLED'].includes(to) ? 'button--secondary' : ''}" type="submit" data-to="${to}">${t}</button>`).join('')}</div></form>` : notice('info', 'This request is closed.')}</div></div>`;
    const form = m.body.querySelector('form');
    if (!form) return;
    let to = '';
    form.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => { to = b.dataset.to; }));
    bindForm(form, { note: [maxLength(300)] }, async (v) => {
      showFormError(form, '');
      if (['REJECTED', 'CANCELLED'].includes(to) && v.note.length < 5) { showFormError(form, 'Please record a reason (at least 5 characters).'); return; }
      await request(`/manage/healthcare/appointments/${id}/transition`, { method: 'POST', body: { to, note: v.note } });
      toast('Status updated.');
      m.close();
      appointments();
    }, { onServerError: (e) => showFormError(form, e.details?.note || e.message) });
  } catch (e) { m.body.innerHTML = errorState(e.message, false); }
}

// ---------------------------------------------------------------- services, providers, slots
async function services() {
  panel.innerHTML = skeletons(2);
  try {
    ({ services: state.services } = await request('/manage/healthcare/services'));
    panel.innerHTML = `<div class="row row--between" style="margin-bottom:12px"><h2 class="section-title" style="margin:0">Services and providers</h2><button class="button" type="button" data-new-service>New service</button></div>
      ${state.services.length ? state.services.map((s) => `<section class="card" data-svc="${s.id}" style="margin-bottom:12px"><div class="row row--between"><div><h3 style="margin:0">${esc(s.name)} ${s.published ? '' : badge('DRAFT', 'Unpublished')} ${s.isDemo ? sample : ''}</h3><p class="small muted">${esc(s.category)} · ${esc(s.description)}</p></div><div class="row"><button class="button button--secondary button--sm" type="button" data-edit-service>Edit</button><button class="button button--ghost button--sm" type="button" data-del-service>Delete</button><button class="button button--sm" type="button" data-new-provider>Add provider</button></div></div>
        ${s.providers.length ? `<ul class="list">${s.providers.map((p) => `<li data-prov="${p.id}"><div class="row row--between"><span><strong>${esc(p.name)}</strong> ${p.published ? '' : badge('DRAFT', 'Unpublished')}<br><span class="muted small">${esc(p.speciality)} · ${p._count.slots} open future slot(s)</span></span><span class="row"><button class="button button--sm" type="button" data-slots>Availability</button><button class="button button--secondary button--sm" type="button" data-edit-prov>Edit</button><button class="button button--ghost button--sm" type="button" data-del-prov>Delete</button></span></div></li>`).join('')}</ul>` : '<p class="small muted">No providers yet.</p>'}</section>`).join('') : emptyState('No services yet', 'Create a service, then add providers and availability.')}`;
  } catch (e) { panel.innerHTML = errorState(e.message); }
}

function serviceDialog(s) {
  const m = modal({ title: s ? 'Edit service' : 'New service', body: `<form class="form" novalidate>${formError}${fields([{ name: 'name', label: 'Name', required: true, value: s?.name, maxlength: 80 }, { name: 'category', label: 'Category', required: true, value: s?.category, maxlength: 60 }, { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 3, value: s?.description, maxlength: 600 }, { name: 'published', label: 'Published (visible to students)', type: 'checkbox', value: s ? s.published : true }])}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Save</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { name: [required('Enter a name.'), minLength(3), maxLength(80)], category: [required('Enter a category.'), maxLength(60)], description: [required('Enter a description.'), minLength(10), maxLength(600)] }, async (v) => {
    showFormError(form, '');
    await request(s ? `/manage/healthcare/services/${s.id}` : '/manage/healthcare/services', { method: s ? 'PUT' : 'POST', body: { ...v, published: v.published } });
    toast('Service saved.');
    m.close();
    services();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

function providerDialog(serviceId, p) {
  const m = modal({ title: p ? 'Edit provider' : 'New provider', body: `<form class="form" novalidate>${formError}${fields([{ name: 'name', label: 'Name', required: true, value: p?.name, maxlength: 80 }, { name: 'speciality', label: 'Speciality', required: true, value: p?.speciality, maxlength: 80 }, { name: 'bio', label: 'Short bio', type: 'textarea', rows: 2, value: p?.bio, maxlength: 600 }, { name: 'published', label: 'Published', type: 'checkbox', value: p ? p.published : true }])}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Save</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { name: [required('Enter a name.'), minLength(3), maxLength(80)], speciality: [required('Enter a speciality.'), maxLength(80)], bio: [maxLength(600)] }, async (v) => {
    showFormError(form, '');
    await request(p ? `/manage/healthcare/providers/${p.id}` : '/manage/healthcare/providers', { method: p ? 'PUT' : 'POST', body: { ...v, serviceId, published: v.published } });
    toast('Provider saved.');
    m.close();
    services();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

async function slotsDialog(provider) {
  const m = modal({ title: `Availability: ${provider.name}`, body: skeletons(1, 'skeleton-row'), wide: true });
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  async function draw() {
    try {
      const { slots } = await request(`/manage/healthcare/providers/${provider.id}/slots`);
      m.body.innerHTML = `<form class="form" data-gen novalidate>${formError}<div class="form-row">${fields([{ name: 'date', label: 'Date', type: 'date', required: true, value: tomorrow, min: new Date().toISOString().slice(0, 10) }, { name: 'slotMinutes', label: 'Slot length (minutes)', type: 'number', required: true, value: 30, min: 10, max: 120 }])}</div><div class="form-row">${fields([{ name: 'startTime', label: 'From', type: 'time', required: true, value: '10:00' }, { name: 'endTime', label: 'To', type: 'time', required: true, value: '12:00' }])}</div><button class="button" type="submit">Add slots</button></form>
        <h3 class="section-title" style="margin-top:16px">Upcoming slots (${slots.length})</h3>
        ${slots.length ? table([{ label: 'Time', html: (s) => esc(dt(s.startsAt)) }, { label: 'Status', html: (s) => badge(s.status) }, { label: 'Booked by', html: (s) => (s.appointment ? esc(s.appointment.referenceNo) : '–') }, { label: '', html: (s) => (s.status === 'BOOKED' ? '' : `<button class="button button--ghost button--sm" type="button" data-block="${s.id}" data-to="${s.status === 'BLOCKED' ? 'OPEN' : 'BLOCKED'}">${s.status === 'BLOCKED' ? 'Unblock' : 'Block'}</button><button class="button button--ghost button--sm" type="button" data-rm="${s.id}">Delete</button>`) }], slots) : '<p class="muted">No upcoming slots.</p>'}`;
      const form = m.body.querySelector('[data-gen]');
      bindForm(form, { date: [required('Choose a date.')], slotMinutes: [required('Enter the slot length.'), intRange(10, 120, 'Slot length must be 10 to 120 minutes.')], startTime: [required('Enter a start time.'), pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')], endTime: [required('Enter an end time.'), pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')] }, async (v) => {
        showFormError(form, '');
        const r = await request(`/manage/healthcare/providers/${provider.id}/slots`, { method: 'POST', body: v });
        toast(`${r.created} slot(s) added${r.skipped ? `, ${r.skipped} already existed` : ''}.`);
        draw();
      }, { onServerError: (e) => showFormError(form, Object.values(e.details || {})[0] || e.message) });
      m.body.querySelectorAll('[data-block]').forEach((b) => b.addEventListener('click', async () => { await attempt(() => request(`/manage/healthcare/slots/${b.dataset.block}`, { method: 'PUT', body: { status: b.dataset.to } })); draw(); }));
      m.body.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => { await attempt(() => request(`/manage/healthcare/slots/${b.dataset.rm}`, { method: 'DELETE' }), { success: 'Slot deleted.' }); draw(); }));
    } catch (e) { m.body.innerHTML = errorState(e.message, false); }
  }
  draw();
}

on(view, 'click', {
  '[data-open]': (b) => openAppt(b.dataset.open),
  '[data-new-service]': () => serviceDialog(),
  '[data-edit-service]': (b) => serviceDialog(state.services.find((s) => s.id === b.closest('[data-svc]').dataset.svc)),
  '[data-del-service]': async (b) => { const s = state.services.find((x) => x.id === b.closest('[data-svc]').dataset.svc); if (!(await confirmDialog({ title: 'Delete service?', message: `"${s.name}" and its providers and slots will be deleted. Services with appointment history cannot be deleted; unpublish them instead.`, confirmLabel: 'Delete', danger: true }))) return; await attempt(() => request(`/manage/healthcare/services/${s.id}`, { method: 'DELETE' }), { success: 'Service deleted.' }); services(); },
  '[data-new-provider]': (b) => providerDialog(b.closest('[data-svc]').dataset.svc),
  '[data-edit-prov]': (b) => { const s = state.services.find((x) => x.id === b.closest('[data-svc]').dataset.svc); providerDialog(s.id, s.providers.find((p) => p.id === b.closest('[data-prov]').dataset.prov)); },
  '[data-del-prov]': async (b) => { const id = b.closest('[data-prov]').dataset.prov; if (!(await confirmDialog({ title: 'Delete provider?', message: 'The provider and all of their slots will be deleted. Providers with active appointments cannot be deleted.', confirmLabel: 'Delete', danger: true }))) return; await attempt(() => request(`/manage/healthcare/providers/${id}`, { method: 'DELETE' }), { success: 'Provider deleted.' }); services(); },
  '[data-slots]': (b) => { const s = state.services.find((x) => x.id === b.closest('[data-svc]').dataset.svc); slotsDialog(s.providers.find((p) => p.id === b.closest('[data-prov]').dataset.prov)); },
  '[data-retry]': () => (panel.dataset.reload === 'appointments' ? appointments() : services())
});
tabs($('[data-tabs]'), [['appointments', 'Appointment requests'], ['services', 'Services and providers']], 'appointments', (t) => { panel.dataset.reload = t; if (t === 'appointments') appointments(); else services(); });

appointments();
