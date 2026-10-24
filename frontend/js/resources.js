import { renderNav, renderFooter, initReveal } from './layout.js';
import { request } from './api.js';
import { esc, label, notice, emptyHtml, pagination, debounce } from './ui.js';

renderNav('/resources');
renderFooter();
initReveal();

const $ = (s) => document.querySelector(s);
const list = $('[data-list]');
const filters = $('[data-filters]');
const dialog = $('[data-dialog]');
const category = $('#category');
const state = { kind: '', page: 1, items: [] };

const KIND_LABEL = { DEPARTMENT: 'Department', LIBRARY: 'Library', FACILITY: 'Facility', SUPPORT: 'Support', LINK: 'Link', ORGANIZATION: 'Organisation' };

function card(r) {
  return `<article class="card-item">
    <div class="card-item__tags"><span class="chip">${esc(KIND_LABEL[r.kind] || label(r.kind))}</span>${r.category ? `<span class="chip chip--muted">${esc(r.category)}</span>` : ''}${r.isDemo ? '<span class="chip chip--demo">Sample</span>' : ''}</div>
    <h3>${esc(r.title)}</h3>
    <p>${esc(r.summary)}</p>
    <div class="card-item__actions"><button class="button button--ghost button--sm" data-details="${r.id}">View details</button></div>
  </article>`;
}

function fillCategories(cats) {
  const current = category.value;
  category.innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  if (cats.includes(current)) category.value = current;
}

async function load() {
  list.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton skeleton-card"></div>').join('');
  $('[data-pager]').innerHTML = '';
  try {
    const p = new URLSearchParams();
    if (state.kind) p.set('kind', state.kind);
    new FormData(filters).forEach((v, k) => { if (String(v).trim()) p.set(k, String(v).trim()); });
    p.set('page', state.page);
    const data = await request(`/resources?${p}`);
    state.items = data.resources;
    fillCategories(data.categories);
    $('[data-count]').textContent = `${data.total} result${data.total === 1 ? '' : 's'}`;
    list.innerHTML = data.resources.length ? data.resources.map(card).join('') : `<div style="grid-column:1/-1">${emptyHtml('Nothing found', 'Try another search or pick a different section.')}</div>`;
    pagination($('[data-pager]'), data, (n) => { state.page = n; load(); });
  } catch (e) {
    list.innerHTML = `<div style="grid-column:1/-1">${notice('error', e.message)}<p><button class="button button--secondary button--sm" data-retry>Try again</button></p></div>`;
  }
}

list.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if ('retry' in t.dataset) return load();
  const r = state.items.find((x) => x.id === t.dataset.details);
  if (!r) return;
  $('[data-dlg-title]').textContent = r.title;
  $('[data-dlg-body]').innerHTML = `<div class="card-item__tags"><span class="chip">${esc(KIND_LABEL[r.kind])}</span>${r.isDemo ? '<span class="chip chip--demo">Sample content</span>' : ''}</div><p>${esc(r.summary)}</p>${r.details ? `<p>${esc(r.details)}</p>` : ''}`;
  dialog.showModal();
});
$('[data-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (ev) => { if (ev.target === dialog) dialog.close(); });

const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());
document.querySelectorAll('[data-kind]').forEach((tab) => tab.addEventListener('click', () => {
  state.kind = tab.dataset.kind;
  category.value = '';
  document.querySelectorAll('[data-kind]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  reload();
}));

load();
