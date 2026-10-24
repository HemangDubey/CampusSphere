import { initShell } from '../shell.js';
import { renderDiscovery } from '../discover.js';
import { request } from '../api.js';
import { $, esc, label, badge, cover, pageHead, skeletons, emptyState, errorState, pager, tabs, field, qs, debounce, on, attempt } from '../kit.js';

const view = $('[data-view]');
const user = await initShell({ active: '/resources', crumbs: [['Campus Life'], ['Campus Resources']] });
const params = new URLSearchParams(location.search);
const KINDS = [['', 'All'], ['DEPARTMENT', 'Departments'], ['FACILITY', 'Facilities'], ['SUPPORT', 'Student support'], ['SERVICE', 'Services'], ['CLUB', 'Clubs'], ['ORGANIZATION', 'Organisations'], ['LINK', 'Links']];
let discovered = false;
const state = { kind: '', page: 1, saved: params.get('view') === 'saved' && Boolean(user), items: [] };

view.innerHTML = `${pageHead({ eyebrow: 'Campus life', title: 'Campus resources', lead: 'Departments, facilities, support and services. Save what you use, and send a request where a service accepts them.' })}
  <div data-kinds></div><div data-tabs-saved></div>
  <form class="toolbar" data-filters role="search" aria-label="Filter resources" novalidate>
    <div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="80" placeholder="Search resources"></div>
    <div class="field"><label class="field__label" for="categoryId">Category</label><select class="select" id="categoryId" name="categoryId"><option value="">All categories</option></select></div>
    ${field({ name: 'status', label: 'Availability', type: 'select', placeholder: 'Any', options: [['AVAILABLE', 'Available'], ['LIMITED', 'Limited'], ['UNAVAILABLE', 'Unavailable']] })}
    <div class="field"><label class="field__label" for="sort">Sort by</label><select class="select" id="sort" name="sort"><option value="title">Title (A to Z)</option><option value="recent">Recently added</option><option value="popular">Most saved</option></select></div>
    <label class="check"><input type="checkbox" name="requestable" value="true"><span>Accepts requests</span></label><button class="button button--secondary" type="reset">Clear</button></form>
  <div data-discover hidden></div>
  <p class="results-note" data-count></p><div class="grid grid--cards" data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

const AVAIL = { AVAILABLE: 'Available', LIMITED: 'Limited availability', UNAVAILABLE: 'Currently unavailable' };
function card(r) {
  return `<article class="card card--flush card--link">${cover(r.imageUrl, r.title, r.kind)}<div class="card__body">
    <div class="chips"><span class="badge badge--muted">${esc(label(r.kind))}</span>${r.category ? `<span class="badge badge--muted">${esc(r.category.name)}</span>` : ''}${badge(r.status, AVAIL[r.status])}</div>
    <h3><a href="/resources/${r.id}">${esc(r.title)}</a></h3><p>${esc(r.summary)}</p>
    <div class="row"><a class="button button--secondary button--sm" href="/resources/${r.id}">View details</a>${r.acceptsRequests && r.status !== 'UNAVAILABLE' ? `<a class="button button--sm" href="/resources/${r.id}?request=1">Make a request</a>` : ''}${user ? `<button class="button button--ghost button--sm" type="button" data-bm="${r.id}" aria-pressed="${r.bookmarked}">${r.bookmarked ? 'Saved ✓' : 'Save'}</button>` : ''}</div></div></article>`;
}

async function load() {
  list.innerHTML = skeletons(6);
  $('[data-pager]').innerHTML = '';
  try {
    $('[data-discover]').hidden = true;
    if (state.saved) {
      const { resources } = await request('/resources/bookmarks');
      state.items = resources;
      $('[data-count]').textContent = `${resources.length} saved`;
      list.innerHTML = resources.length ? resources.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('Nothing saved yet', 'Save the resources you use most and they will be kept here.', '<button class="button button--sm" type="button" data-all>Browse resources</button>')}</div>`;
      return;
    }
    const q = Object.fromEntries(new FormData(filters));
    const plain = state.page === 1 && !state.kind && !q.q && !q.categoryId && !q.status && !q.requestable && (q.sort || 'title') === 'title';
    if (plain) { if (!discovered) { discovered = true; await renderDiscovery($('[data-discover]')); } else if ($('[data-discover]').innerHTML) $('[data-discover]').hidden = false; }
    const data = await request(`/resources?${qs({ ...q, kind: state.kind, page: state.page, pageSize: 12 })}`);
    state.items = data.resources;
    $('[data-count]').textContent = `${data.total} result${data.total === 1 ? '' : 's'}`;
    list.innerHTML = data.resources.length ? data.resources.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('Nothing found', 'Try another search, pick a different section, or clear the filters.', '<button class="button button--secondary button--sm" type="button" data-clear>Clear filters</button>')}</div>`;
    pager($('[data-pager]'), data, (p) => { state.page = p; load(); });
  } catch (e) { list.innerHTML = `<div style="grid-column:1/-1">${errorState(e.message)}</div>`; }
}

async function categories() {
  try {
    const { categories: cats } = await request('/resource-categories');
    $('#categoryId').insertAdjacentHTML('beforeend', cats.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.count})</option>`).join(''));
  } catch { /* the filter simply stays at "All categories" */ }
}

tabs($('[data-kinds]'), KINDS.map(([k, l]) => [k || 'all', l]), 'all', (k) => { state.saved = false; state.kind = k === 'all' ? '' : k; state.page = 1; filters.hidden = false; load(); });
if (user) {
  const b = document.createElement('button');
  b.className = 'tab';
  b.type = 'button';
  b.textContent = 'Saved';
  b.dataset.tab = 'saved';
  b.setAttribute('aria-selected', String(state.saved));
  $('[data-kinds]').append(b);
  b.addEventListener('click', () => { $('[data-kinds]').querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === b))); state.saved = true; filters.hidden = true; load(); });
  if (state.saved) { $('[data-kinds]').querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === b))); filters.hidden = true; }
}
const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());
on(view, 'click', {
  '[data-bm]': async (b) => {
    const r = state.items.find((x) => x.id === b.dataset.bm);
    await attempt(() => request(`/resources/${r.id}/bookmark`, { method: r.bookmarked ? 'DELETE' : 'PUT' }), { success: r.bookmarked ? 'Removed from saved.' : 'Saved.' });
    load();
  },
  '[data-clear]': () => filters.reset(),
  '[data-all]': () => $('[data-kinds] [data-tab=all]').click(),
  '[data-retry]': load
});
categories();
load();
