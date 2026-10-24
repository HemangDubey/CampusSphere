// "My reading list": private status, progress, collection and notes per item, manual ordering and CSV export.
import { request } from './api.js';
import { esc, cover, badge, emptyState, errorState, on, attempt, confirmDialog, modal, fields, formError, showFormError, toast } from './kit.js';
import { bindForm, intRange, maxLength } from './validators.js';

const READING = { WANT_TO_READ: 'Want to read', READING: 'Reading', DONE: 'Finished' };
let items = [];
let host;

const row = (i, n) => `<article class="card card--flush rl" data-id="${i.resource.id}">
  ${cover(i.resource.imageUrl, i.resource.title, 'LIBRARY', 'cover--thumb')}
  <div class="card__body"><div class="chips">${badge(i.status, READING[i.status])}${i.collection ? `<span class="badge badge--muted">${esc(i.collection)}</span>` : ''}${i.progress != null ? `<span class="badge badge--muted">${i.progress}%</span>` : ''}</div>
  <h3><a href="/resources/${i.resource.id}">${esc(i.resource.title)}</a></h3>${i.resource.author ? `<p class="small">${esc(i.resource.author)}</p>` : ''}
  ${i.notes ? `<p class="small rl__notes">${esc(i.notes)}</p>` : ''}
  <div class="row"><label class="visually-hidden" for="st-${i.resource.id}">Status</label><select class="select select--sm" id="st-${i.resource.id}" data-status>${Object.entries(READING).map(([v, l]) => `<option value="${v}"${v === i.status ? ' selected' : ''}>${l}</option>`).join('')}</select>
  <button class="button button--secondary button--sm" type="button" data-edit>Notes &amp; progress</button>
  <button class="button button--ghost button--sm" type="button" data-up aria-label="Move up" ${n === 0 ? 'disabled' : ''}>↑</button><button class="button button--ghost button--sm" type="button" data-down aria-label="Move down" ${n === items.length - 1 ? 'disabled' : ''}>↓</button>
  <button class="button button--ghost button--sm" type="button" data-remove>Remove</button></div></div></article>`;

function draw(filterText = '', collection = '') {
  const shown = items.filter((i) => (!collection || i.collection === collection) && (!filterText || `${i.resource.title} ${i.resource.author || ''} ${i.notes || ''}`.toLowerCase().includes(filterText.toLowerCase())));
  const collections = [...new Set(items.map((i) => i.collection).filter(Boolean))];
  host.innerHTML = `<div class="toolbar"><div class="field field--wide"><label class="field__label" for="rl-q">Search my list</label><input class="input" id="rl-q" type="search" maxlength="80" value="${esc(filterText)}" placeholder="Title, author or note"></div>
    <div class="field"><label class="field__label" for="rl-c">Collection</label><select class="select" id="rl-c"><option value="">All</option>${collections.map((c) => `<option${c === collection ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    <a class="button button--secondary" href="/api/reading-list/export.csv" download>Export CSV</a></div>
    <div class="grid grid--cards">${shown.length ? shown.map((i) => row(i, items.indexOf(i))).join('') : `<div style="grid-column:1/-1">${emptyState('Nothing matches', 'Try a different search or collection.')}</div>`}</div>`;
}

async function patch(id, body, success) {
  const r = await attempt(() => request(`/reading-list/${id}`, { method: 'PATCH', body }), { success });
  if (r) { Object.assign(items.find((i) => i.resource.id === id), r.item); draw(host.querySelector('#rl-q')?.value, host.querySelector('#rl-c')?.value); }
}

async function move(id, delta) {
  const from = items.findIndex((i) => i.resource.id === id);
  const to = from + delta;
  if (to < 0 || to >= items.length) return;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  const r = await attempt(() => request('/reading-list-order', { method: 'PUT', body: { ids: next.map((i) => i.resource.id) } }));
  if (r !== undefined) { items = next; draw(); }
}

function editDialog(item) {
  const m = modal({ title: item.resource.title, body: `<form class="form" novalidate>${formError}${fields([{ name: 'progress', label: 'Progress (%)', type: 'number', min: 0, max: 100, value: item.progress ?? '' }, { name: 'collection', label: 'Collection', hint: 'For example "Semester 5" or "Project research".', maxlength: 40, value: item.collection }, { name: 'notes', label: 'Private notes', type: 'textarea', rows: 5, maxlength: 2000, value: item.notes }])}<p class="small muted">Only you can see your notes.</p><div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Save</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { progress: [intRange(0, 100, 'Enter a whole number from 0 to 100.')], notes: [maxLength(2000)] }, async (v) => {
    showFormError(form, '');
    const { item: saved } = await request(`/reading-list/${item.resource.id}`, { method: 'PATCH', body: { progress: v.progress === '' ? null : Number(v.progress), collection: v.collection || '', notes: v.notes || '' } });
    Object.assign(item, saved);
    toast('Saved.');
    m.close();
    draw();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

let wired = false;
export async function renderReadingList(target, countEl, browse) {
  host = target;
  try {
    ({ items } = await request('/reading-list'));
    countEl.textContent = `${items.length} on your reading list`;
    if (!items.length) { host.innerHTML = emptyState('Your reading list is empty', 'Add items from the catalogue to track what you want to read, are reading, or have finished.', '<button class="button button--sm" type="button" data-cat>Browse the catalogue</button>'); return; }
    draw();
    if (!wired) {
      wired = true;
      const id = (b) => b.closest('[data-id]').dataset.id;
      const find = (b) => items.find((i) => i.resource.id === id(b));
      on(host, 'click', {
        '[data-edit]': (b) => editDialog(find(b)),
        '[data-up]': (b) => move(id(b), -1),
        '[data-down]': (b) => move(id(b), 1),
        '[data-remove]': async (b) => {
          const it = find(b);
          if (!(await confirmDialog({ title: 'Remove from your reading list?', message: `"${it.resource.title}" and your notes on it will be removed.`, confirmLabel: 'Remove', danger: true }))) return;
          await attempt(() => request(`/reading-list/${it.resource.id}`, { method: 'DELETE' }), { success: 'Removed.' });
          renderReadingList(host, countEl, browse);
        }
      });
      host.addEventListener('change', (e) => {
        if (e.target.matches('[data-status]')) patch(e.target.closest('[data-id]').dataset.id, { status: e.target.value }, 'Status updated.');
        if (e.target.matches('#rl-c')) draw(host.querySelector('#rl-q').value, e.target.value);
      });
      host.addEventListener('input', (e) => { if (e.target.matches('#rl-q')) { const pos = e.target.selectionStart; draw(e.target.value, host.querySelector('#rl-c').value); const q = host.querySelector('#rl-q'); q.focus(); q.setSelectionRange(pos, pos); } });
    }
  } catch (e) { host.innerHTML = errorState(e.message); }
}
