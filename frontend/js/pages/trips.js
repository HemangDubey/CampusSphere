import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, inr, dOnly, badge, pageHead, skeletons, emptyState, errorState, on, attempt, confirmDialog, modal, fields, formRow, formError, showFormError, toast } from '../kit.js';
import { bindForm, required, minLength, maxLength, intRange } from '../validators.js';

const view = $('[data-view]');
await initShell({ active: '/trips', crumbs: [['Campus Life'], ['Travel Explorer', '/travel'], ['My trips']], requireAuth: true });
let trips = [];

function card(t) {
  const range = t.startDate && t.endDate ? `${dOnly(t.startDate)} to ${dOnly(t.endDate)}` : 'Dates not set';
  return `<article class="card" data-id="${t.id}"><div class="chips">${t.role === 'OWNER' ? '' : badge('PUBLISHED', `Shared with you (${t.role.toLowerCase()})`)}${t.shared ? '<span class="badge badge--muted">Share link on</span>' : ''}</div>
    <h3><a href="/trips/${t.id}">${esc(t.title)}</a></h3><p class="small">${esc(t.destination?.name || 'No destination chosen')} · ${esc(range)}</p>
    <p class="small"><strong>${esc(inr(t.estimatedTotalInr))}</strong> planned${t.budgetInr != null ? ` of ${esc(inr(t.budgetInr))}` : ''} · ${t.items.length} item${t.items.length === 1 ? '' : 's'} ${t.overBudget ? badge('REJECTED', 'Over budget') : ''}</p>
    <div class="row"><a class="button button--sm" href="/trips/${t.id}">Open</a><button class="button button--secondary button--sm" type="button" data-dup>Duplicate</button>${t.role === 'OWNER' ? '<button class="button button--ghost button--sm" type="button" data-del>Delete</button>' : ''}</div></article>`;
}

function newTripDialog(destinations) {
  const m = modal({
    title: 'New trip',
    body: `<form class="form" novalidate>${formError}${fields([{ name: 'title', label: 'Trip name', required: true, maxlength: 80 }, { name: 'destinationId', label: 'Destination (optional)', type: 'select', options: destinations.map((d) => [d.id, d.name]) }])}
      ${formRow({ name: 'startDate', label: 'Start date', type: 'date' }, { name: 'endDate', label: 'End date', type: 'date' })}
      ${fields([{ name: 'budgetInr', label: 'Budget in rupees (optional)', type: 'number', min: 0 }])}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Create trip</button></div></form>`
  });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { title: [required('Give your trip a name.'), minLength(3), maxLength(80)], budgetInr: [intRange(0, 10000000, 'Enter a whole number of rupees.')] }, async (v) => {
    showFormError(form, '');
    if (v.startDate && v.endDate && v.endDate < v.startDate) { showFormError(form, 'The end date cannot be before the start date.'); return; }
    const { trip } = await request('/trips', { method: 'POST', body: v });
    toast('Trip created.');
    location.assign(`/trips/${trip.id}`);
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

async function load() {
  view.innerHTML = `${pageHead({ eyebrow: 'Travel planner', title: 'My trips', lead: 'Plan itineraries, track estimated costs and share them with friends.', actions: '<button class="button" type="button" data-new>New trip</button> <a class="button button--secondary" href="/travel">Find destinations</a>' })}<div class="grid grid--cards" data-list>${skeletons(3)}</div>`;
  try {
    ({ trips } = await request('/trips'));
    $('[data-list]').innerHTML = trips.length ? trips.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('No trips yet', 'Start from a destination you like, or create a blank trip and add your own plan.', '<div class="row"><button class="button button--sm" type="button" data-new>Create a trip</button><a class="button button--secondary button--sm" href="/travel">Explore destinations</a></div>')}</div>`;
  } catch (e) { $('[data-list]').innerHTML = `<div style="grid-column:1/-1">${errorState(e.message)}</div>`; }
}

on(view, 'click', {
  '[data-new]': async () => { const r = await attempt(() => request('/destinations?pageSize=50')); newTripDialog(r?.destinations || []); },
  '[data-dup]': async (b) => { const id = b.closest('[data-id]').dataset.id; const r = await attempt(() => request(`/trips/${id}/duplicate`, { method: 'POST' }), { success: 'Trip duplicated.' }); if (r) load(); },
  '[data-del]': async (b) => {
    const t = trips.find((x) => x.id === b.closest('[data-id]').dataset.id);
    if (!(await confirmDialog({ title: 'Delete this trip?', message: `"${t.title}" and its itinerary will be permanently deleted. This cannot be undone.`, confirmLabel: 'Delete trip', danger: true }))) return;
    await attempt(() => request(`/trips/${t.id}`, { method: 'DELETE' }), { success: 'Trip deleted.' });
    load();
  },
  '[data-retry]': load
});
load();
