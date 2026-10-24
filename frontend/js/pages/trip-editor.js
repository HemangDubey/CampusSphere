import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, inr, dOnly, badge, skeletons, errorState, on, attempt, confirmDialog, modal, fields, formRow, formError, showFormError, toast, notice } from '../kit.js';
import { bindForm, required, minLength, maxLength, intRange } from '../validators.js';

const view = $('[data-view]');
const id = location.pathname.split('/').filter(Boolean)[1];
await initShell({ active: '/trips', crumbs: [['Campus Life'], ['Travel Explorer', '/travel'], ['My trips', '/trips'], ['Planner']], requireAuth: true });
let trip;
let items = [];
let dirty = false;

const canEdit = () => trip.role === 'OWNER' || trip.role === 'EDITOR';
const total = () => items.reduce((s, i) => s + Number(i.estCostInr || 0), 0);

function itemRow(i, n) {
  return `<li class="plan-item" data-i="${n}"><div class="plan-item__main"><strong>${esc(i.title)}</strong><span class="muted small">Day ${i.dayNumber} · ${esc(inr(i.estCostInr))}${i.notes ? ` · ${esc(i.notes)}` : ''}</span></div>
    ${canEdit() ? `<div class="row"><button class="icon-btn" type="button" data-up aria-label="Move ${esc(i.title)} up" ${n === 0 ? 'disabled' : ''}>↑</button><button class="icon-btn" type="button" data-down aria-label="Move ${esc(i.title)} down" ${n === items.length - 1 ? 'disabled' : ''}>↓</button><button class="icon-btn" type="button" data-edit-item aria-label="Edit ${esc(i.title)}">✎</button><button class="icon-btn" type="button" data-remove aria-label="Remove ${esc(i.title)}">✕</button></div>` : ''}</li>`;
}

function render() {
  const over = trip.budgetInr != null && total() > trip.budgetInr;
  const days = {};
  items.forEach((i, n) => { (days[i.dayNumber] ||= []).push([i, n]); });
  view.innerHTML = `<p><a class="auth__link" href="/trips">&larr; My trips</a></p>
    <div class="page-head"><div><span class="label label--accent">${trip.role === 'OWNER' ? 'Your trip' : `Shared with you (${trip.role.toLowerCase()})`}</span><h1 class="page-head__title" style="font-size:clamp(28px,4vw,52px)">${esc(trip.title)}</h1>
      <p class="page-head__lead">${esc(trip.destination?.name || 'No destination chosen')}${trip.startDate ? ` · ${esc(dOnly(trip.startDate))} to ${esc(dOnly(trip.endDate || trip.startDate))}` : ''}${trip.notes ? ` · ${esc(trip.notes)}` : ''}</p></div>
      <div class="page-head__actions">${canEdit() ? '<button class="button button--secondary button--sm" type="button" data-edit-trip>Edit details</button>' : ''}<button class="button button--secondary button--sm" type="button" data-dup>Duplicate</button><button class="button button--secondary button--sm" type="button" data-print>Print</button>${trip.role === 'OWNER' ? '<button class="button button--ghost button--sm" type="button" data-del>Delete</button>' : ''}</div></div>
    ${!canEdit() ? notice('info', 'You have view-only access to this trip.') : ''}
    <div class="split"><section class="card"><div class="row row--between"><h2 class="section-title">Itinerary</h2>${canEdit() ? '<button class="button button--sm" type="button" data-add>Add item</button>' : ''}</div>
      ${items.length ? Object.keys(days).sort((a, b) => a - b).map((d) => `<h3 class="small muted" style="margin:14px 0 4px">Day ${d}</h3><ul class="list">${days[d].map(([i, n]) => itemRow(i, n)).join('')}</ul>`).join('') : '<div class="empty-state"><p class="empty-state__title">Nothing planned yet</p><p class="empty-state__text">Add travel, stays, food and activities with estimated costs.</p></div>'}
      ${canEdit() ? `<div class="row"><button class="button" type="button" data-save ${dirty ? '' : 'disabled'}>Save itinerary</button><span class="small muted" data-dirty>${dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span></div>` : ''}</section>
      <aside class="stack-lg"><section class="card"><h2 class="section-title">Expenses (estimates)</h2><dl class="kv"><dt>Planned</dt><dd><strong>${esc(inr(total()))}</strong></dd>${trip.budgetInr != null ? `<dt>Budget</dt><dd>${esc(inr(trip.budgetInr))}</dd><dt>${over ? 'Over by' : 'Remaining'}</dt><dd>${over ? badge('REJECTED', inr(total() - trip.budgetInr)) : esc(inr(trip.budgetInr - total()))}</dd>` : ''}${trip.days ? `<dt>Length</dt><dd>${trip.days} day${trip.days > 1 ? 's' : ''}</dd>` : ''}</dl>
        ${trip.budgetInr != null ? `<div class="meter" aria-hidden="true"><span style="width:${Math.min(100, Math.round((total() / Math.max(trip.budgetInr, 1)) * 100))}%;${over ? 'background:var(--color-error)' : ''}"></span></div>` : ''}<p class="small muted">All amounts are your own estimates, not live prices.</p></section>
        ${trip.role === 'OWNER' ? sharePanel() : ''}</aside></div>`;
}

function sharePanel() {
  const link = trip.shared ? `${location.origin}/trips/shared/${trip.shareToken}` : '';
  return `<section class="card"><h2 class="section-title">Share and collaborate</h2>
    <label class="check"><input type="checkbox" data-share ${trip.shared ? 'checked' : ''}><span>Anyone with the link can view (read-only)</span></label>
    ${link ? `<div class="row"><input class="input" readonly value="${esc(link)}" aria-label="Share link"><button class="button button--secondary button--sm" type="button" data-copy="${esc(link)}">Copy</button></div>` : ''}
    <h3 class="small" style="margin:8px 0 0">Participants</h3>
    ${trip.members.length ? `<ul class="list">${trip.members.map((m) => `<li><div class="row row--between"><span>${esc(m.name)} <span class="muted small">${esc(m.role.toLowerCase())}</span></span><button class="button button--ghost button--sm" type="button" data-remove-member="${m.userId}">Remove</button></div></li>`).join('')}</ul>` : '<p class="small muted">Just you so far.</p>'}
    <form class="form" data-invite novalidate>${formError}<div class="form-row">${fields([{ name: 'email', label: 'Invite by email', type: 'email', required: true, placeholder: 'friend@university.edu' }])}${fields([{ name: 'role', label: 'Can', type: 'select', options: [['EDITOR', 'Edit'], ['VIEWER', 'View only']], value: 'EDITOR' }])}</div><button class="button button--sm" type="submit">Add participant</button></form></section>`;
}

function itemDialog(index) {
  const cur = index === undefined ? {} : items[index];
  const m = modal({
    title: index === undefined ? 'Add itinerary item' : 'Edit item',
    body: `<form class="form" novalidate>${formError}${fields([{ name: 'title', label: 'What', required: true, value: cur.title, maxlength: 100, placeholder: 'e.g. Bus to Yelagiri' }])}
      ${formRow({ name: 'dayNumber', label: 'Day', type: 'number', min: 1, max: 61, value: cur.dayNumber || 1 }, { name: 'estCostInr', label: 'Estimated cost (₹)', type: 'number', min: 0, value: cur.estCostInr ?? 0 })}
      ${fields([{ name: 'notes', label: 'Notes', type: 'textarea', rows: 2, value: cur.notes, maxlength: 300 }])}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">${index === undefined ? 'Add item' : 'Update item'}</button></div></form>`
  });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { title: [required('Enter what this item is.'), maxLength(100)], dayNumber: [intRange(1, 61, 'Day must be 1 to 61.')], estCostInr: [intRange(0, 10000000, 'Enter a whole number of rupees.')], notes: [maxLength(300)] }, (v) => {
    const next = { title: v.title, dayNumber: Number(v.dayNumber || 1), estCostInr: Number(v.estCostInr || 0), notes: v.notes || null, destinationId: cur.destinationId || null };
    if (index === undefined) items.push(next); else items[index] = next;
    dirty = true;
    m.close();
    render();
  });
}

function editTripDialog() {
  const m = modal({
    title: 'Trip details',
    body: `<form class="form" novalidate>${formError}${fields([{ name: 'title', label: 'Trip name', required: true, value: trip.title, maxlength: 80 }])}
      ${formRow({ name: 'startDate', label: 'Start date', type: 'date', value: trip.startDate?.slice(0, 10) }, { name: 'endDate', label: 'End date', type: 'date', value: trip.endDate?.slice(0, 10) })}
      ${fields([{ name: 'budgetInr', label: 'Budget in rupees', type: 'number', min: 0, value: trip.budgetInr }, { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, value: trip.notes, maxlength: 1000 }])}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Save details</button></div></form>`
  });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { title: [required('Give your trip a name.'), minLength(3), maxLength(80)], budgetInr: [intRange(0, 10000000, 'Enter a whole number of rupees.')], notes: [maxLength(1000)] }, async (v) => {
    showFormError(form, '');
    if (v.startDate && v.endDate && v.endDate < v.startDate) { showFormError(form, 'The end date cannot be before the start date.'); return; }
    ({ trip } = await request(`/trips/${id}`, { method: 'PUT', body: { ...v, destinationId: trip.destinationId } }));
    toast('Trip details saved.');
    m.close();
    render();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

async function load() {
  view.innerHTML = skeletons(2);
  try { ({ trip } = await request(`/trips/${id}`)); items = trip.items.map((i) => ({ title: i.title, dayNumber: i.dayNumber, estCostInr: i.estCostInr, notes: i.notes, destinationId: i.destinationId })); dirty = false; render(); }
  catch (e) { view.innerHTML = `<p><a class="auth__link" href="/trips">&larr; My trips</a></p>${errorState(e.status === 404 ? 'That trip does not exist or you do not have access to it.' : e.message, e.status !== 404)}`; }
}

const swap = (a, b) => { [items[a], items[b]] = [items[b], items[a]]; dirty = true; render(); };
on(view, 'click', {
  '[data-add]': () => itemDialog(),
  '[data-edit-item]': (b) => itemDialog(Number(b.closest('[data-i]').dataset.i)),
  '[data-remove]': (b) => { items.splice(Number(b.closest('[data-i]').dataset.i), 1); dirty = true; render(); },
  '[data-up]': (b) => { const n = Number(b.closest('[data-i]').dataset.i); if (n > 0) swap(n, n - 1); },
  '[data-down]': (b) => { const n = Number(b.closest('[data-i]').dataset.i); if (n < items.length - 1) swap(n, n + 1); },
  '[data-save]': async () => { const r = await attempt(() => request(`/trips/${id}/items`, { method: 'PUT', body: { items } }), { success: 'Itinerary saved.' }); if (r) { trip = r.trip; dirty = false; render(); } },
  '[data-edit-trip]': editTripDialog,
  '[data-dup]': async () => { const r = await attempt(() => request(`/trips/${id}/duplicate`, { method: 'POST' }), { success: 'Trip duplicated.' }); if (r) location.assign(`/trips/${r.trip.id}`); },
  '[data-print]': () => window.print(),
  '[data-del]': async () => {
    if (!(await confirmDialog({ title: 'Delete this trip?', message: `"${trip.title}" and its itinerary will be permanently deleted.`, confirmLabel: 'Delete trip', danger: true }))) return;
    if (await attempt(() => request(`/trips/${id}`, { method: 'DELETE' }), { success: 'Trip deleted.' }) !== undefined) location.assign('/trips');
  },
  '[data-copy]': async (b) => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Link copied.'); } catch { window.prompt('Copy this link', b.dataset.copy); } },
  '[data-remove-member]': async (b) => { const r = await attempt(() => request(`/trips/${id}/members/${b.dataset.removeMember}`, { method: 'DELETE' }), { success: 'Participant removed.' }); if (r !== undefined) load(); },
  '[data-retry]': load
});
view.addEventListener('change', async (e) => {
  if (!e.target.matches('[data-share]')) return;
  const r = await attempt(() => request(`/trips/${id}/share`, { method: 'POST', body: { enabled: e.target.checked } }));
  if (r) { trip = { ...trip, ...r.trip }; render(); }
});
view.addEventListener('submit', async (e) => {
  if (!e.target.matches('[data-invite]')) return;
  e.preventDefault();
  const form = e.target;
  showFormError(form, '');
  try { const r = await request(`/trips/${id}/members`, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); trip = r.trip; toast('Participant added.'); render(); }
  catch (err) { showFormError(form, err.details?.email || err.message); }
});
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

load();
