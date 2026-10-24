import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, cover, pageHead, skeletons, emptyState, errorState, pager, tabs, qs, debounce, on, attempt, badge } from '../kit.js';

const view = $('[data-view]');
const user = await initShell({ active: '/library', crumbs: [['Campus Life'], ['Library']] });
const state = { view: 'catalogue', page: 1, items: [] };
const READING = { WANT_TO_READ: 'Want to read', READING: 'Reading', DONE: 'Finished' };

view.innerHTML = `${pageHead({ eyebrow: 'Campus life', title: 'The library', lead: 'Search the catalogue, keep a reading list and save resources. Borrowing and reservations are not available in this version.', actions: '<button class="button button--secondary" type="button" data-suggest>Suggest a resource</button>' })}
  <div data-tabs></div>
  <form class="toolbar" data-filters role="search" aria-label="Search the library" novalidate>
    <div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="80" placeholder="Title, author or topic"></div>
    <div class="field"><label class="field__label" for="categoryId">Category</label><select class="select" id="categoryId" name="categoryId"><option value="">All categories</option></select></div><button class="button button--secondary" type="reset">Clear</button></form>
  <p class="results-note" data-count></p><div class="grid grid--cards" data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

const card = (r) => `<article class="card card--flush card--link">${cover(r.imageUrl, r.title, 'LIBRARY', 'cover--thumb')}<div class="card__body"><div class="chips">${r.category ? `<span class="badge badge--muted">${esc(r.category.name)}</span>` : ''}${r.readingStatus ? badge(r.readingStatus, READING[r.readingStatus]) : ''}</div>
  <h3><a href="/resources/${r.id}">${esc(r.title)}</a></h3>${r.author ? `<p class="small">${esc(r.author)}</p>` : ''}<p class="small">${esc(r.summary)}</p>
  <div class="row"><a class="button button--secondary button--sm" href="/resources/${r.id}">Details</a>${user ? `<button class="button button--sm" type="button" data-rl="${r.id}">${r.readingStatus ? 'On my list' : 'Add to reading list'}</button><button class="button button--ghost button--sm" type="button" data-bm="${r.id}">${r.bookmarked ? 'Saved ✓' : 'Save'}</button>` : ''}</div></div></article>`;

async function load() {
  list.innerHTML = skeletons(6);
  $('[data-pager]').innerHTML = '';
  try {
    if (state.view === 'reading') {
      if (!user) { location.assign('/login?next=/library'); return; }
      const { items } = await request('/reading-list');
      state.items = items.map((i) => ({ ...i.resource, readingStatus: i.status }));
      $('[data-count]').textContent = `${items.length} on your reading list`;
      list.innerHTML = state.items.length ? state.items.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('Your reading list is empty', 'Add books from the catalogue to track what you want to read, are reading, or have finished.', '<button class="button button--sm" type="button" data-cat>Browse the catalogue</button>')}</div>`;
      return;
    }
    const data = await request(`/resources?${qs({ ...Object.fromEntries(new FormData(filters)), kind: 'LIBRARY', page: state.page, pageSize: 12 })}`);
    state.items = data.resources;
    $('[data-count]').textContent = `${data.total} item${data.total === 1 ? '' : 's'}`;
    list.innerHTML = data.resources.length ? data.resources.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('Nothing found', 'Try another title, author or category.')}</div>`;
    pager($('[data-pager]'), data, (p) => { state.page = p; load(); });
  } catch (e) { list.innerHTML = `<div style="grid-column:1/-1">${errorState(e.message)}</div>`; }
}

(async () => {
  try { const { categories } = await request('/resource-categories?kind=LIBRARY'); $('#categoryId').insertAdjacentHTML('beforeend', categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')); } catch { /* optional */ }
})();
tabs($('[data-tabs]'), [['catalogue', 'Catalogue'], ['reading', 'My reading list']], 'catalogue', (t) => { if (t === 'reading' && !user) { location.assign('/login?next=/library'); return; } state.view = t; state.page = 1; filters.hidden = t === 'reading'; load(); });
const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());

on(view, 'click', {
  '[data-rl]': async (b) => {
    const r = state.items.find((x) => x.id === b.dataset.rl);
    if (r.readingStatus) { location.assign(`/resources/${r.id}`); return; }
    await attempt(() => request(`/reading-list/${r.id}`, { method: 'PUT', body: { status: 'WANT_TO_READ' } }), { success: 'Added to your reading list.' });
    load();
  },
  '[data-bm]': async (b) => { const r = state.items.find((x) => x.id === b.dataset.bm); await attempt(() => request(`/resources/${r.id}/bookmark`, { method: r.bookmarked ? 'DELETE' : 'PUT' }), { success: r.bookmarked ? 'Removed from saved.' : 'Saved.' }); load(); },
  '[data-suggest]': async () => {
    const r = await attempt(() => request('/resources?q=Suggest%20a%20library&requestable=true'));
    const target = r?.resources?.[0];
    if (target) location.assign(`/resources/${target.id}?request=1`); else location.assign('/resources?requestable=true');
  },
  '[data-cat]': () => $('[data-tab=catalogue]').click(),
  '[data-retry]': load
});
load();
