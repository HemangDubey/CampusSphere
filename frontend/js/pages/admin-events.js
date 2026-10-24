import { initShell } from '../shell.js';
import { request, API_BASE } from '../api.js';
import { $, esc, label, dt, badge, pageHead, skeletons, emptyState, errorState, pager, table, qs, debounce, on, modal, field, fields, formRow, formError, showFormError, toast, confirmDialog, attempt, notice } from '../kit.js';
import { bindForm, required, minLength, maxLength, intRange, oneOf, dateTime, httpsUrl } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/admin/events', crumbs: [['Administration'], ['Event Management']], requireAuth: true });
if (!user.permissions.includes('event:manage')) { view.innerHTML = pageHead({ title: 'Event management', eyebrow: 'Restricted' }) + notice('error', 'You need the Event Organizer or an administrator role to manage events.'); await new Promise(() => {}); }

const state = { page: 1, rows: [] };
const CATS = ['TECHNICAL', 'CULTURAL', 'SPORTS', 'WORKSHOP', 'SYMPOSIUM'];
const MODES = ['IN_PERSON', 'ONLINE', 'HYBRID'];
const local = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

view.innerHTML = `${pageHead({ eyebrow: 'Administration', title: 'Event management', lead: user.role === 'EVENT_ORGANIZER' ? 'Create and run your events.' : 'Manage all events.', actions: '<button class="button" type="button" data-new>New event</button>' })}
  <form class="toolbar" data-filters role="search" novalidate><div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="80" placeholder="Event title"></div>
  ${field({ name: 'status', label: 'Status', type: 'select', placeholder: 'Any status', options: [['DRAFT', 'Draft'], ['PUBLISHED', 'Published'], ['CANCELLED', 'Cancelled']] })}<button class="button button--secondary" type="reset">Clear</button></form>
  <div data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

async function load() {
  list.innerHTML = skeletons(4, 'skeleton-row');
  try {
    const data = await request(`/manage/events?${qs({ ...Object.fromEntries(new FormData(filters)), page: state.page })}`);
    state.rows = data.events;
    list.innerHTML = data.events.length ? table([
      { label: 'Event', html: (e) => `<strong>${esc(e.title)}</strong><br><span class="muted small">${esc(label(e.category))} · ${esc(label(e.mode))}</span>` },
      { label: 'When', html: (e) => esc(dt(e.startsAt)) }, { label: 'Status', html: (e) => badge(e.status) },
      { label: 'Seats', html: (e) => (e.capacity ? `${e.registrationCount} / ${e.capacity}<div class="meter" aria-hidden="true"><span style="width:${Math.min(100, Math.round((e.registrationCount / e.capacity) * 100))}%"></span></div>` : `${e.registrationCount} (no limit)`) },
      { label: 'Actions', html: (e) => `<div class="row"><button class="button button--sm" type="button" data-attendees="${e.id}">Attendees</button>${e.status !== 'CANCELLED' ? `<button class="button button--secondary button--sm" type="button" data-edit="${e.id}">Edit</button>` : ''}${e.status === 'DRAFT' ? `<button class="button button--secondary button--sm" type="button" data-publish="${e.id}">Publish</button><button class="button button--ghost button--sm" type="button" data-delete="${e.id}">Delete</button>` : ''}${e.status === 'PUBLISHED' ? `${e.registrationCount === 0 ? `<button class="button button--secondary button--sm" type="button" data-unpublish="${e.id}">Unpublish</button>` : ''}<button class="button button--ghost button--sm" type="button" data-cancel="${e.id}">Cancel event</button>` : ''}</div>` }
    ], data.events) : emptyState('No events yet', 'Create your first event. It starts as a draft until you publish it.', '<button class="button button--sm" type="button" data-new>New event</button>');
    pager($('[data-pager]'), data, (p) => { state.page = p; load(); });
  } catch (e) { list.innerHTML = errorState(e.message); }
}

function editor(ev) {
  const e = ev || {};
  const m = modal({
    title: ev ? 'Edit event' : 'New event', wide: true,
    body: `<form class="form" novalidate>${formError}
      ${fields([{ name: 'title', label: 'Title', required: true, value: e.title, maxlength: 120 }, { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 3, value: e.description, maxlength: 4000 }])}
      ${formRow({ name: 'category', label: 'Category', type: 'select', required: true, options: CATS.map((c) => [c, label(c)]), value: e.category }, { name: 'mode', label: 'Event type', type: 'select', required: true, options: MODES.map((c) => [c, label(c)]), value: e.mode || 'IN_PERSON' })}
      ${formRow({ name: 'startsAt', label: 'Starts', type: 'datetime-local', required: true, value: local(e.startsAt) }, { name: 'endsAt', label: 'Ends', type: 'datetime-local', value: local(e.endsAt) })}
      ${formRow({ name: 'venue', label: 'Venue', required: true, value: e.venue, maxlength: 150 }, { name: 'onlineLink', label: 'Online link (https)', type: 'url', value: e.onlineLink, hint: 'Shown only to registered attendees.' })}
      ${formRow({ name: 'capacity', label: 'Capacity (blank = unlimited)', type: 'number', min: 1, value: e.capacity }, { name: 'fee', label: 'Fee in ₹ (display only)', type: 'number', min: 0, value: e.fee || 0, hint: 'No payment is collected by this app.' })}
      ${formRow({ name: 'registrationOpensAt', label: 'Registration opens', type: 'datetime-local', value: local(e.registrationOpensAt) }, { name: 'registrationClosesAt', label: 'Registration closes', type: 'datetime-local', value: local(e.registrationClosesAt), hint: 'Defaults to the event start.' })}
      ${fields([{ name: 'schedule', label: 'Schedule (one line per item)', type: 'textarea', rows: 3, value: e.schedule, maxlength: 2000 }, { name: 'eligibility', label: 'Eligibility', value: e.eligibility, maxlength: 500 }, { name: 'instructions', label: 'Participation instructions', type: 'textarea', rows: 2, value: e.instructions, maxlength: 1500 }])}
      ${formRow({ name: 'organizerName', label: 'Organizer name', value: e.organizerName, maxlength: 80 }, { name: 'coverImage', label: 'Cover image (https link)', type: 'url', value: e.coverImage, hint: 'Optional. A generated cover is used if empty or broken.' })}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">${ev ? 'Save changes' : 'Save draft'}</button></div></form>`
  });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, {
    title: [required('Enter a title.'), minLength(3), maxLength(120)], description: [required('Enter a description.'), minLength(10), maxLength(4000)], category: [required('Choose a category.'), oneOf(CATS)], mode: [required('Choose a type.'), oneOf(MODES)],
    startsAt: [required('Enter the start.'), dateTime()], endsAt: [dateTime(), (v, a) => (v && a.startsAt && v <= a.startsAt ? 'The end must be after the start.' : null)], venue: [required('Enter the venue.'), minLength(2), maxLength(150)],
    onlineLink: [httpsUrl()], capacity: [intRange(1, 5000, 'Capacity must be 1 to 5000.')], fee: [intRange(0, 100000, 'Fee must be 0 to 100000.')],
    registrationOpensAt: [dateTime()], registrationClosesAt: [dateTime(), (v, a) => (v && a.registrationOpensAt && v <= a.registrationOpensAt ? 'Registration must close after it opens.' : null)],
    schedule: [maxLength(2000)], eligibility: [maxLength(500)], instructions: [maxLength(1500)], organizerName: [maxLength(80)], coverImage: [httpsUrl()]
  }, async (v) => {
    showFormError(form, '');
    const toIso = (s) => (s ? new Date(s).toISOString() : '');
    const body = { ...v, startsAt: toIso(v.startsAt), endsAt: toIso(v.endsAt), registrationOpensAt: toIso(v.registrationOpensAt), registrationClosesAt: toIso(v.registrationClosesAt) };
    await request(ev ? `/manage/events/${ev.id}` : '/manage/events', { method: ev ? 'PUT' : 'POST', body });
    toast(ev ? 'Event saved.' : 'Draft saved. Publish it when you are ready.');
    m.close();
    load();
  }, { onServerError: (err) => { if (err.code !== 'VALIDATION_ERROR') showFormError(form, err.message); } });
}

async function attendees(eventId) {
  const ev = state.rows.find((x) => x.id === eventId);
  const m = modal({ title: `Attendees: ${ev.title}`, body: skeletons(1, 'skeleton-row'), wide: true });
  const q = { q: '', status: 'REGISTERED' };
  async function draw() {
    try {
      const data = await request(`/manage/events/${eventId}/registrations?${qs({ ...q, pageSize: 100 })}`);
      const s = data.stats;
      m.body.innerHTML = `<div class="grid grid--stats"><div class="stat"><span class="stat__n">${s.registered}</span><span class="stat__l">Registered${data.capacity ? ` of ${data.capacity}` : ''}</span></div><div class="stat"><span class="stat__n">${s.attended}</span><span class="stat__l">Attended</span></div><div class="stat"><span class="stat__n">${s.cancelled}</span><span class="stat__l">Cancelled</span></div><div class="stat"><span class="stat__n">${data.capacity ? Math.round((s.registered / data.capacity) * 100) : '–'}${data.capacity ? '%' : ''}</span><span class="stat__l">Capacity used</span></div></div>
        <div class="toolbar" style="margin-top:12px"><div class="field field--wide"><label class="field__label" for="aq">Search attendees</label><input class="input" id="aq" type="search" value="${esc(q.q)}" placeholder="Name, registration no., email or reference"></div>${field({ name: 'astatus', label: 'Show', type: 'select', options: [['REGISTERED', 'Registered'], ['CANCELLED', 'Cancelled'], ['', 'All']], value: q.status })}<a class="button button--secondary" href="${API_BASE}/api/manage/events/${eventId}/export.csv?${qs({ q: q.q, status: q.status })}" download>Export CSV</a></div>
        ${data.registrations.length ? table([{ label: 'Attendee', html: (r) => `<strong>${esc(r.fullName || '')}</strong><br><span class="muted small">${esc(r.email || '')}</span>` }, { label: 'Reg. no.', key: 'registrationNo' }, { label: 'Dept', html: (r) => `${esc(r.department || '')}${r.yearOfStudy ? `, Y${r.yearOfStudy}` : ''}` }, { label: 'Reference', key: 'referenceNo' }, { label: 'Status', html: (r) => badge(r.status) }, { label: 'Attended', html: (r) => (r.status === 'REGISTERED' ? `<label class="check"><input type="checkbox" data-att="${r.id}" ${r.attended ? 'checked' : ''}><span class="small">${r.attended ? 'Present' : 'Mark'}</span></label>` : '–') }], data.registrations) : emptyState('No attendees match', 'Registrations will appear here as students sign up.')}`;
      m.body.querySelector('#aq').addEventListener('input', debounce((e) => { q.q = e.target.value; draw(); }, 350));
      m.body.querySelector('[name=astatus]').addEventListener('change', (e) => { q.status = e.target.value; draw(); });
      m.body.querySelectorAll('[data-att]').forEach((c) => c.addEventListener('change', async () => {
        const r = await attempt(() => request(`/manage/events/${eventId}/registrations/${c.dataset.att}/attendance`, { method: 'POST', body: { attended: c.checked } }));
        if (r) draw(); else c.checked = !c.checked;
      }));
    } catch (e) { m.body.innerHTML = errorState(e.message, false); }
  }
  draw();
}

on(view, 'click', {
  '[data-new]': () => editor(),
  '[data-edit]': async (b) => { const r = await attempt(() => request(`/manage/events/${b.dataset.edit}`)); if (r) editor(r.event); },
  '[data-attendees]': (b) => attendees(b.dataset.attendees),
  '[data-publish]': async (b) => { await attempt(() => request(`/manage/events/${b.dataset.publish}/publish`, { method: 'POST', body: {} }), { success: 'Event published.' }); load(); },
  '[data-unpublish]': async (b) => { await attempt(() => request(`/manage/events/${b.dataset.unpublish}/unpublish`, { method: 'POST', body: {} }), { success: 'Moved back to draft.' }); load(); },
  '[data-delete]': async (b) => { if (!(await confirmDialog({ title: 'Delete this draft?', message: 'The draft will be permanently deleted.', confirmLabel: 'Delete draft', danger: true }))) return; await attempt(() => request(`/manage/events/${b.dataset.delete}`, { method: 'DELETE' }), { success: 'Draft deleted.' }); load(); },
  '[data-cancel]': async (b) => {
    const ev = state.rows.find((x) => x.id === b.dataset.cancel);
    const reason = await confirmDialog({ title: 'Cancel this event?', message: `"${ev.title}" will be cancelled and every registered attendee will be notified. This cannot be undone.`, confirmLabel: 'Cancel event', danger: true, requireReason: true, reasonLabel: 'Reason shown to attendees' });
    if (!reason) return;
    await attempt(() => request(`/manage/events/${ev.id}/cancel`, { method: 'POST', body: { reason } }), { success: 'Event cancelled and attendees notified.' });
    load();
  },
  '[data-retry]': load
});
const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());
load();
