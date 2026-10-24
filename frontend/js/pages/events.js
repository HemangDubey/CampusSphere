import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, dt, badge, cover, pageHead, skeletons, emptyState, errorState, pager, tabs, field, qs, debounce, on, attempt, confirmDialog } from '../kit.js';
import { openRegistration } from '../event-register.js';

const view = $('[data-view]');
const user = await initShell({ active: '/events', crumbs: [['Campus Life'], ['Events & Symposiums']] });
const params = new URLSearchParams(location.search);
const state = { view: params.get('view') === 'mine' && user ? 'mine' : 'discover', page: 1, events: [] };

const manage = user?.permissions?.includes('event:manage');
view.innerHTML = `${pageHead({ eyebrow: 'Campus life', title: 'Events and symposiums', lead: 'Find something to attend, register in a few steps, and keep track of your registrations.', actions: manage ? '<a class="button button--sm" href="/admin/events">Manage events</a>' : '' })}
  <div data-tabs></div>
  <form class="toolbar" data-filters role="search" aria-label="Filter events" novalidate>
    <div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="80" placeholder="Title, keyword, venue or organizer"></div>
    ${field({ name: 'category', label: 'Category', type: 'select', placeholder: 'All categories', options: ['TECHNICAL', 'CULTURAL', 'SPORTS', 'WORKSHOP', 'SYMPOSIUM'].map((c) => [c, label(c)]) })}
    ${field({ name: 'mode', label: 'Event type', type: 'select', placeholder: 'Any type', options: [['IN_PERSON', 'In person'], ['ONLINE', 'Online'], ['HYBRID', 'Hybrid']] })}
    ${field({ name: 'when', label: 'Timing', type: 'select', placeholder: 'Upcoming', options: [['upcoming', 'Upcoming'], ['ongoing', 'Ongoing'], ['past', 'Past'], ['all', 'All']] })}
    ${field({ name: 'sort', label: 'Sort by', type: 'select', placeholder: 'Date', options: [['date', 'Date'], ['relevance', 'Relevance'], ['popular', 'Most popular']] })}
    ${field({ name: 'from', label: 'From date', type: 'date' })}${field({ name: 'to', label: 'To date', type: 'date' })}
    <button class="button button--secondary" type="reset">Clear</button>
  </form>
  <p class="results-note" data-count></p><div class="grid grid--cards" data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

function status(e) {
  if (e.status === 'CANCELLED') return badge('CANCELLED', 'Cancelled');
  if (e.registered) return badge('REGISTERED', 'Registered');
  if (e.timing === 'past') return '<span class="badge badge--muted">Ended</span>';
  if (e.timing === 'ongoing') return badge('PUBLISHED', 'Happening now');
  if (e.isFull) return badge('UNAVAILABLE', 'Full');
  return e.spotsLeft != null ? `<span class="badge badge--muted">${e.spotsLeft} seat${e.spotsLeft === 1 ? '' : 's'} left</span>` : '<span class="badge badge--muted">Open</span>';
}

function card(e) {
  const reg = e.registered
    ? (e.canCancel ? `<button class="button button--secondary button--sm" type="button" data-cancel="${e.id}">Cancel registration</button>` : '')
    : e.registrationOpen ? `<button class="button button--sm" type="button" data-register="${e.id}">Register</button>` : '';
  return `<article class="card card--flush card--link">${cover(e.coverImage, e.title, e.category)}<div class="card__body">
    <div class="chips"><span class="badge badge--muted">${esc(label(e.category))}</span><span class="badge badge--muted">${esc(label(e.mode))}</span>${e.fee > 0 ? `<span class="badge badge--muted">₹${e.fee}</span>` : ''}</div>
    <h3><a href="/events/${e.id}">${esc(e.title)}</a></h3>
    <p class="small">${esc(dt(e.startsAt))}<br>${esc(e.venue)}</p>
    <div class="row">${status(e)}${e.organizerDisplay ? `<span class="muted small">${esc(e.organizerDisplay)}</span>` : ''}</div>
    ${!e.registrationOpen && !e.registered && e.registrationNote && e.timing !== 'past' ? `<p class="small muted">${esc(e.registrationNote.startsWith('Registration opens') ? 'Registration has not opened yet.' : e.registrationNote)}</p>` : ''}
    <div class="row"><a class="button button--secondary button--sm" href="/events/${e.id}">View details</a>${reg}</div></div></article>`;
}

async function load() {
  list.innerHTML = skeletons(6);
  $('[data-pager]').innerHTML = '';
  try {
    if (state.view === 'mine') {
      if (!user) { location.assign('/login?next=/events%3Fview%3Dmine'); return; }
      const { registrations } = await request('/events/mine');
      state.events = registrations.map((r) => r.event);
      $('[data-count]').textContent = `${registrations.length} registration${registrations.length === 1 ? '' : 's'}`;
      list.innerHTML = registrations.length
        ? registrations.map((r) => card({ ...r.event, registered: r.status === 'REGISTERED' }).replace('<h3>', `<p class="small"><strong>Ref ${esc(r.referenceNo)}</strong> ${r.status === 'CANCELLED' ? badge('CANCELLED', 'You cancelled') : ''}</p><h3>`)).join('')
        : `<div style="grid-column:1/-1">${emptyState('No registrations yet', 'Register for an event and it will appear here with its reference number.', '<button class="button button--sm" type="button" data-discover>Discover events</button>')}</div>`;
      return;
    }
    const q = Object.fromEntries(new FormData(filters));
    const data = await request(`/events?${qs({ ...q, page: state.page, pageSize: 9 })}`);
    state.events = data.events;
    $('[data-count]').textContent = `${data.total} event${data.total === 1 ? '' : 's'}`;
    list.innerHTML = data.events.length ? data.events.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('No events match', 'Try a different keyword, widen the dates, or clear the filters.', '<button class="button button--secondary button--sm" type="button" data-clear>Clear filters</button>')}</div>`;
    pager($('[data-pager]'), data, (p) => { state.page = p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  } catch (e) { list.innerHTML = `<div style="grid-column:1/-1">${errorState(e.message)}</div>`; }
}

const setView = (v) => { state.view = v; state.page = 1; filters.hidden = v === 'mine'; load(); };
tabs($('[data-tabs]'), [['discover', 'Discover'], ['mine', 'My events']], state.view, (t) => { if (t === 'mine' && !user) { location.assign('/login?next=/events%3Fview%3Dmine'); return; } setView(t); });
filters.hidden = state.view === 'mine';
const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());

on(view, 'click', {
  '[data-register]': (b) => openRegistration(state.events.find((e) => e.id === b.dataset.register), user, load),
  '[data-cancel]': async (b) => {
    const ev = state.events.find((e) => e.id === b.dataset.cancel);
    if (!(await confirmDialog({ title: 'Cancel registration?', message: `You will give up your seat for "${ev.title}". You can register again later if seats remain.`, confirmLabel: 'Cancel registration', danger: true }))) return;
    await attempt(() => request(`/events/${ev.id}/register`, { method: 'DELETE' }), { success: 'Registration cancelled.' });
    load();
  },
  '[data-clear]': () => { filters.reset(); },
  '[data-discover]': () => { document.querySelector('[data-tab=discover]').click(); },
  '[data-retry]': load
});
if (params.get('q')) { filters.elements.q.value = params.get('q'); }
load();
