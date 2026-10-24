import { renderNav, renderFooter, initReveal } from './layout.js';
import { authApi, request } from './api.js';
import { esc, label, inr, notice, emptyHtml, pagination, debounce, toast } from './ui.js';

renderNav('/travel');
renderFooter();
initReveal();

const $ = (s) => document.querySelector(s);
const list = $('[data-list]');
const filters = $('[data-filters]');
const dialog = $('[data-dialog]');
const state = { view: 'all', page: 1, user: null, items: [] };

const cost = (d) => `${inr(d.budgetMinInr)} to ${inr(d.budgetMaxInr)} (approx.)`;
const saveButton = (d) => state.user
  ? `<button class="button ${d.favorited ? 'button--secondary' : 'button--teal'} button--sm" data-fav="${d.id}" aria-pressed="${d.favorited}">${d.favorited ? 'Saved ✓' : 'Save'}</button>`
  : '<a class="button button--teal button--sm" href="/login?next=/travel">Sign in to save</a>';

function card(d) {
  return `<article class="card-item">
    <div class="tile tile--${d.type}" aria-hidden="true">${esc(d.name.split(' ')[0])}</div>
    <div class="card-item__tags"><span class="chip">${esc(label(d.type))}</span><span class="chip chip--muted">${esc(label(d.budget))}</span></div>
    <h3>${esc(d.name)}</h3>
    <div class="card-item__meta"><span>${esc(d.region)}</span><span>${esc(cost(d))} · ${d.recommendedDays} day${d.recommendedDays > 1 ? 's' : ''}</span></div>
    <p>${esc(d.summary)}</p>
    <div class="card-item__actions"><button class="button button--ghost button--sm" data-details="${d.id}">Details</button>${saveButton(d)}</div>
  </article>`;
}

function render(items, total) {
  state.items = items;
  $('[data-count]').textContent = `${total} destination${total === 1 ? '' : 's'}`;
  list.innerHTML = items.length
    ? items.map(card).join('')
    : `<div style="grid-column:1/-1">${state.view === 'saved' ? emptyHtml('Nothing saved yet', 'Save a destination and it will show up here.') : emptyHtml('No destinations match', 'Try another search or clear the filters.')}</div>`;
}

async function load() {
  list.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton skeleton-card"></div>').join('');
  $('[data-pager]').innerHTML = '';
  try {
    if (state.view === 'saved') {
      const { destinations } = await request('/destinations/favorites');
      render(destinations, destinations.length);
      return;
    }
    const p = new URLSearchParams();
    new FormData(filters).forEach((v, k) => { if (String(v).trim()) p.set(k, String(v).trim()); });
    p.set('page', state.page);
    const data = await request(`/destinations?${p}`);
    render(data.destinations, data.total);
    pagination($('[data-pager]'), data, (n) => { state.page = n; load(); });
  } catch (e) {
    list.innerHTML = `<div style="grid-column:1/-1">${notice('error', e.message)}<p><button class="button button--secondary button--sm" data-retry>Try again</button></p></div>`;
  }
}

async function toggleFav(id) {
  const d = state.items.find((x) => x.id === id);
  if (!d) return;
  try {
    await request(`/destinations/${id}/favorite`, { method: d.favorited ? 'DELETE' : 'PUT' });
    toast(d.favorited ? 'Removed from saved.' : 'Saved.');
  } catch (e) {
    if (e.status === 401) { location.assign('/login?next=/travel'); return; }
    toast(e.message, 'error');
  }
  if (dialog.open) dialog.close();
  load();
}

function openDetails(id) {
  const d = state.items.find((x) => x.id === id);
  if (!d) return;
  $('[data-dlg-title]').textContent = d.name;
  $('[data-dlg-body]').innerHTML = `
    <div class="card-item__tags"><span class="chip">${esc(label(d.type))}</span><span class="chip chip--muted">${esc(label(d.budget))}</span><span class="chip chip--demo">Approximate info</span></div>
    <p>${esc(d.description)}</p>
    <dl class="kv"><dt>Where</dt><dd>${esc(d.region)}</dd><dt>Estimated budget</dt><dd>${esc(cost(d))} per person, illustrative only</dd><dt>Suggested time</dt><dd>${d.recommendedDays} day${d.recommendedDays > 1 ? 's' : ''}</dd></dl>
    <div><strong>Travel tips</strong><ul>${d.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    <p class="field__hint">No photos, maps, bookings or live prices are included in this demo.</p>
    <div class="card-item__actions">${saveButton(d)}</div>`;
  dialog.showModal();
}

const onClick = (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.fav) toggleFav(t.dataset.fav);
  else if (t.dataset.details) openDetails(t.dataset.details);
  else if ('retry' in t.dataset) load();
};
list.addEventListener('click', onClick);
$('[data-dlg-body]').addEventListener('click', onClick);
$('[data-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (ev) => { if (ev.target === dialog) dialog.close(); });

const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  if (tab.dataset.view === 'saved' && !state.user) { location.assign('/login?next=/travel'); return; }
  state.view = tab.dataset.view;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  filters.hidden = state.view === 'saved';
  reload();
}));

authApi.me().then(({ user }) => { state.user = user; }).catch(() => {}).finally(load);
