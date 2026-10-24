import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, inr, cover, pageHead, skeletons, emptyState, errorState, pager, tabs, field, qs, debounce, on, attempt, disclosure } from '../kit.js';

const view = $('[data-view]');
const user = await initShell({ active: '/travel', crumbs: [['Campus Life'], ['Travel Explorer']] });
const params = new URLSearchParams(location.search);
const state = { view: params.get('view') === 'saved' && user ? 'saved' : 'discover', page: 1, items: [] };

view.innerHTML = `${pageHead({ eyebrow: 'Campus life', title: 'Travel explorer', lead: 'Day trips and weekend ideas around Vellore and Tamil Nadu. Save places you like and turn them into a plan.', actions: `<a class="button button--sm" href="/trips">${user ? 'My trips' : 'Plan a trip'}</a>` })}
  ${disclosure('Budgets and durations are approximate estimates, not live prices or bookings. Check current prices, timings and rules before you travel.')}
  <div data-recent></div><div data-tabs></div>
  <form class="toolbar" data-filters role="search" aria-label="Filter destinations" novalidate>
    <div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="80" placeholder="Destination, region or activity"></div>
    ${field({ name: 'type', label: 'Category', type: 'select', placeholder: 'Any category', options: ['HERITAGE', 'NATURE', 'SPIRITUAL', 'BEACH', 'CITY'].map((t) => [t, label(t)]) })}
    ${field({ name: 'budget', label: 'Budget', type: 'select', placeholder: 'Any budget', options: [['BUDGET', 'Budget'], ['MODERATE', 'Moderate'], ['PREMIUM', 'Premium']] })}
    ${field({ name: 'days', label: 'Up to (days)', type: 'select', placeholder: 'Any length', options: [['1', '1 day'], ['2', '2 days'], ['3', '3 days'], ['5', '5 days']] })}
    ${field({ name: 'maxKm', label: 'Distance', type: 'select', placeholder: 'Any distance', options: [['20', 'Within 20 km'], ['100', 'Within 100 km'], ['200', 'Within 200 km']] })}
    ${field({ name: 'sort', label: 'Sort by', type: 'select', placeholder: 'Name', options: [['budget', 'Lowest budget'], ['popularity', 'Most popular'], ['duration', 'Shortest trip'], ['distance', 'Nearest']] })}
    <button class="button button--secondary" type="reset">Clear</button></form>
  <p class="results-note" data-count></p><div class="grid grid--cards" data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

const saveBtn = (d) => `<button class="button ${d.favorited ? 'button--secondary' : 'button--teal'} button--sm" type="button" data-fav="${d.id}" aria-pressed="${d.favorited}">${d.favorited ? 'Saved ✓' : 'Save'}</button>`;
function card(d) {
  return `<article class="card card--flush card--link">${cover(d.imageUrl, d.name, d.type)}<div class="card__body">
    <div class="chips"><span class="badge badge--muted">${esc(label(d.type))}</span><span class="badge badge--muted">${esc(label(d.budget))}</span></div>
    <h3><a href="/travel/${esc(d.slug)}">${esc(d.name)}</a></h3><p class="small">${esc(d.region)}</p><p>${esc(d.summary)}</p>
    <p class="small"><strong>${esc(inr(d.budgetMinInr))} to ${esc(inr(d.budgetMaxInr))}</strong> (est.) · ${d.recommendedDays} day${d.recommendedDays > 1 ? 's' : ''}${d.distanceKm ? ` · ~${d.distanceKm} km` : ''}</p>
    <div class="row"><a class="button button--secondary button--sm" href="/travel/${esc(d.slug)}">View details</a>${user ? saveBtn(d) : '<a class="button button--teal button--sm" href="/login?next=/travel">Sign in to save</a>'}</div></div></article>`;
}

async function load() {
  list.innerHTML = skeletons(6);
  $('[data-pager]').innerHTML = '';
  try {
    if (state.view === 'saved') {
      const { destinations } = await request('/destinations/favorites');
      state.items = destinations;
      $('[data-count]').textContent = `${destinations.length} saved`;
      list.innerHTML = destinations.length ? destinations.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('Nothing saved yet', 'Press Save on a destination and it will be kept here.', '<button class="button button--sm" type="button" data-discover>Explore destinations</button>')}</div>`;
      return;
    }
    const data = await request(`/destinations?${qs({ ...Object.fromEntries(new FormData(filters)), page: state.page })}`);
    state.items = data.destinations;
    $('[data-count]').textContent = `${data.total} destination${data.total === 1 ? '' : 's'}`;
    list.innerHTML = data.destinations.length ? data.destinations.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('No destinations match', 'Try another search or clear the filters.', '<button class="button button--secondary button--sm" type="button" data-clear>Clear filters</button>')}</div>`;
    pager($('[data-pager]'), data, (p) => { state.page = p; load(); });
  } catch (e) { list.innerHTML = `<div style="grid-column:1/-1">${errorState(e.message)}</div>`; }
}

async function recent() {
  if (!user) return;
  try {
    const { destinations } = await request('/destinations/recent');
    $('[data-recent]').innerHTML = destinations.length ? `<p class="small muted">Recently viewed: ${destinations.map((d) => `<a class="auth__link" href="/travel/${esc(d.slug)}">${esc(d.name)}</a>`).join(', ')}</p>` : '';
  } catch { /* optional strip */ }
}

const setView = (v) => { state.view = v; state.page = 1; filters.hidden = v === 'saved'; load(); };
tabs($('[data-tabs]'), [['discover', 'Discover'], ['saved', 'Saved']], state.view, (t) => { if (t === 'saved' && !user) { location.assign('/login?next=/travel%3Fview%3Dsaved'); return; } setView(t); });
filters.hidden = state.view === 'saved';
const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());

on(view, 'click', {
  '[data-fav]': async (b) => {
    const d = state.items.find((x) => x.id === b.dataset.fav);
    await attempt(() => request(`/destinations/${d.id}/favorite`, { method: d.favorited ? 'DELETE' : 'PUT' }), { success: d.favorited ? 'Removed from saved.' : 'Saved.' });
    load();
  },
  '[data-clear]': () => filters.reset(),
  '[data-discover]': () => document.querySelector('[data-tab=discover]').click(),
  '[data-retry]': load
});
recent();
load();
