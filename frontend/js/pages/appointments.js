import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dt, badge, pageHead, skeletons, emptyState, errorState, on, modal, field, formError, showFormError, toast, timelineHtml, notice, confirmDialog, attempt } from '../kit.js';
import { bindForm, required, minLength, maxLength } from '../validators.js';

const view = $('[data-view]');
await initShell({ active: '/healthcare', crumbs: [['Services'], ['Healthcare', '/healthcare'], ['My appointments']], requireAuth: true });
let items = [];
const ACTIVE = ['REQUESTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED'];

view.innerHTML = `${pageHead({ eyebrow: 'Healthcare', title: 'My appointments', lead: 'Your demonstration appointment requests, their status and history.', actions: '<a class="button" href="/healthcare">New request</a>' })}<div data-list aria-live="polite"></div>`;
const list = $('[data-list]');

const card = (a) => `<article class="card" data-id="${a.id}"><div class="row row--between">${badge(a.status)}<span class="muted small">Ref ${esc(a.referenceNo)}</span></div>
  <h3>${esc(a.service.name)}</h3><p class="small">${esc(a.provider?.name || 'No provider chosen')}${a.slot ? ` · ${esc(dt(a.slot.startsAt))}` : ' · no time requested'}</p><p class="small">${esc(a.reason)}</p>${a.adminNote ? `<p class="small"><strong>Note from the team:</strong> ${esc(a.adminNote)}</p>` : ''}
  <div class="row"><button class="button button--secondary button--sm" type="button" data-history>History</button>${['REQUESTED', 'CONFIRMED'].includes(a.status) && a.providerId ? '<button class="button button--secondary button--sm" type="button" data-reschedule>Reschedule</button>' : ''}${ACTIVE.includes(a.status) ? '<button class="button button--ghost button--sm" type="button" data-cancel>Cancel</button>' : ''}</div></article>`;

async function load() {
  list.innerHTML = skeletons(3);
  try {
    ({ appointments: items } = await request('/healthcare/appointments/mine'));
    list.innerHTML = items.length ? `<div class="grid grid--cards">${items.map(card).join('')}</div>` : emptyState('No appointment requests', 'Pick a service and a time to send your first demonstration request.', '<a class="button button--sm" href="/healthcare">Browse services</a>');
  } catch (e) { list.innerHTML = errorState(e.message); }
}

async function showHistory(a) {
  const m = modal({ title: `Request ${a.referenceNo}`, body: skeletons(1, 'skeleton-row') });
  try { const { history } = await request(`/healthcare/appointments/${a.id}`); m.body.innerHTML = timelineHtml(history) || '<p class="muted">No history yet.</p>'; } catch (e) { m.body.innerHTML = errorState(e.message, false); }
}

async function reschedule(a) {
  const m = modal({ title: 'Reschedule request', body: skeletons(1, 'skeleton-row'), wide: true });
  let slots = [];
  try { ({ slots } = await request(`/healthcare/providers/${a.providerId}`)); } catch (e) { m.body.innerHTML = errorState(e.message, false); return; }
  slots = slots.filter((s) => s.id !== a.slot?.id);
  if (!slots.length) { m.body.innerHTML = notice('info', 'There are no other open slots for this provider right now.'); return; }
  let chosen = null;
  m.body.innerHTML = `<p class="small muted">Current time: ${a.slot ? esc(dt(a.slot.startsAt)) : 'none'}. Your new time is held while the team reviews the change.</p><form class="form" novalidate>${formError}<div class="slot-grid" role="group" aria-label="Available slots">${slots.slice(0, 40).map((s) => `<button class="slot" type="button" data-slot="${s.id}" aria-pressed="false">${esc(dt(s.startsAt))}</button>`).join('')}</div>
    ${field({ name: 'reason', label: 'Reason for changing', type: 'textarea', required: true, rows: 2, maxlength: 300 })}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Send reschedule request</button></div></form>`;
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (!b) return; chosen = b.dataset.slot; form.querySelectorAll('[data-slot]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  bindForm(form, { reason: [required('Give a reason.'), minLength(5, 'Please give a reason (at least 5 characters).'), maxLength(300)] }, async (v) => {
    showFormError(form, '');
    if (!chosen) { showFormError(form, 'Choose a new time slot.'); return; }
    await request(`/healthcare/appointments/${a.id}/reschedule`, { method: 'POST', body: { slotId: chosen, reason: v.reason } });
    toast('Reschedule request sent.');
    m.close();
    load();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

on(view, 'click', {
  '[data-history]': (b) => showHistory(items.find((x) => x.id === b.closest('[data-id]').dataset.id)),
  '[data-reschedule]': (b) => reschedule(items.find((x) => x.id === b.closest('[data-id]').dataset.id)),
  '[data-cancel]': async (b) => {
    const a = items.find((x) => x.id === b.closest('[data-id]').dataset.id);
    if (!(await confirmDialog({ title: 'Cancel this request?', message: `Your request ${a.referenceNo} will be cancelled and its time slot released.`, confirmLabel: 'Cancel request', danger: true }))) return;
    await attempt(() => request(`/healthcare/appointments/${a.id}/cancel`, { method: 'POST', body: {} }), { success: 'Appointment request cancelled.' });
    load();
  },
  '[data-retry]': load
});
load();
