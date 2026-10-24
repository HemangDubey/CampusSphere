import { renderNav, renderFooter, initReveal } from './layout.js';
import { authApi, request } from './api.js';
import { bindForm, required, intRange, oneOf, consent } from './validators.js';
import { esc, label, fmtDate, fmtTime, notice, emptyHtml, pagination, debounce, toast } from './ui.js';

renderNav('/events');
renderFooter();
initReveal();

const $ = (s) => document.querySelector(s);
const list = $('[data-list]');
const filters = $('[data-filters]');
const dialog = $('[data-dialog]');
const state = { view: 'all', page: 1, user: null, events: [] };

function statusChip(e) {
  if (e.registered) return '<span class="chip chip--ok">Registered</span>';
  if (e.isPast) return '<span class="chip chip--muted">Ended</span>';
  if (e.isFull) return '<span class="chip chip--warn">Full</span>';
  if (e.spotsLeft != null) return `<span class="chip">${e.spotsLeft} spot${e.spotsLeft === 1 ? '' : 's'} left</span>`;
  return '<span class="chip">Open registration</span>';
}

function actionButton(e) {
  if (e.isPast) return '';
  if (!state.user) return `<a class="button button--sm" href="/login?next=/events">Sign in to register</a>`;
  if (e.registered) return `<button class="button button--secondary button--sm" data-cancel="${e.id}">Cancel registration</button>`;
  return `<button class="button button--sm" data-register="${e.id}" ${e.isFull ? 'disabled' : ''}>${e.isFull ? 'Event full' : 'Register'}</button>`;
}

function card(e) {
  return `<article class="card-item">
    <div class="card-item__tags"><span class="chip">${esc(label(e.category))}</span><span class="chip chip--muted">${esc(label(e.mode))}</span>${e.isDemo ? '<span class="chip chip--demo">Demo data</span>' : ''}</div>
    <h3>${esc(e.title)}</h3>
    <div class="card-item__meta"><span>${esc(fmtDate(e.startsAt))} · ${esc(fmtTime(e.startsAt))}</span><span>${esc(e.venue)}</span></div>
    <p>${esc(e.description)}</p>
    <div class="card-item__tags">${statusChip(e)}</div>
    <div class="card-item__actions"><button class="button button--ghost button--sm" data-details="${e.id}">Details</button>${actionButton(e)}</div>
  </article>`;
}

function render(events, total) {
  state.events = events;
  $('[data-count]').textContent = total === undefined ? '' : `${total} event${total === 1 ? '' : 's'}`;
  if (!events.length) {
    list.innerHTML = `<div style="grid-column:1/-1">${state.view === 'mine'
      ? emptyHtml('No registrations yet', 'Register for an event from the All events tab and it will appear here.')
      : emptyHtml('No events match', 'Try a different keyword or clear the filters.')}</div>`;
    return;
  }
  list.innerHTML = events.map(card).join('');
}

function query() {
  const p = new URLSearchParams();
  new FormData(filters).forEach((v, k) => { if (String(v).trim()) p.set(k, String(v).trim()); });
  p.set('page', state.page);
  p.set('pageSize', 9);
  return p.toString();
}

async function load() {
  list.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton skeleton-card"></div>').join('');
  $('[data-pager]').innerHTML = '';
  try {
    if (state.view === 'mine') {
      const { events } = await request('/events/mine');
      render(events, events.length);
      return;
    }
    const data = await request(`/events?${query()}`);
    render(data.events, data.total);
    pagination($('[data-pager]'), data, (p) => { state.page = p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  } catch (e) {
    list.innerHTML = `<div style="grid-column:1/-1">${notice('error', e.message)}<p><button class="button button--secondary button--sm" data-retry>Try again</button></p></div>`;
  }
}

const TRACKS = ['Paper presentation', 'Project expo', 'Quiz'];

// Symposium events ask for team size and track before registering (validated again on the server).
function openSymposiumForm(e) {
  $('[data-dlg-title]').textContent = `Register: ${e.title}`;
  $('[data-dlg-body]').innerHTML = `<form class="form" data-symp novalidate>
    <div class="notice notice--error" data-symp-error role="alert" hidden><span class="notice__icon" aria-hidden="true"></span><p></p></div>
    <div class="field"><label class="field__label" for="teamSize">Team size (1 to 4)<span class="req" aria-hidden="true">*</span></label><input class="input" id="teamSize" name="teamSize" type="number" min="1" max="4" inputmode="numeric" required><p class="field__error"></p></div>
    <div class="field"><label class="field__label" for="track">Track<span class="req" aria-hidden="true">*</span></label><select class="select" id="track" name="track" required><option value="">Choose…</option>${TRACKS.map((t) => `<option>${esc(t)}</option>`).join('')}</select><p class="field__error"></p></div>
    <div class="field"><label class="check"><input type="checkbox" name="consent"><span>I confirm my details are correct.</span></label><p class="field__error"></p></div>
    <button class="button" type="submit">Complete registration</button></form>`;
  const f = $('[data-symp]');
  bindForm(f, {
    teamSize: [required('Enter your team size.'), intRange(1, 4, 'Team size must be between 1 and 4.')],
    track: [required('Choose a track.'), oneOf(TRACKS)],
    consent: [consent('Please confirm your details are correct.')]
  }, async (values) => {
    await request(`/events/${e.id}/register`, { method: 'POST', body: values });
    toast('You are registered.');
    dialog.close();
    load();
  }, { onServerError: (err) => {
    if (err.status === 401) { location.assign('/login?next=/events'); return; }
    if (err.code !== 'VALIDATION_ERROR') { const b = $('[data-symp-error]'); b.querySelector('p').textContent = err.message; b.hidden = false; }
  } });
  if (!dialog.open) dialog.showModal();
}

async function act(id, method) {
  if (method === 'POST') {
    const ev = state.events.find((x) => x.id === id);
    if (ev?.category === 'SYMPOSIUM') { openSymposiumForm(ev); return; }
  }
  const button = document.querySelector(`[data-register="${id}"], [data-cancel="${id}"]`);
  if (button) button.disabled = true;
  try {
    await request(`/events/${id}/register`, { method });
    toast(method === 'POST' ? 'You are registered.' : 'Registration cancelled.');
  } catch (e) {
    if (e.status === 401) { location.assign('/login?next=/events'); return; }
    toast(e.message, 'error');
  }
  if (dialog.open) dialog.close();
  load();
}

function openDetails(id) {
  const e = state.events.find((x) => x.id === id);
  if (!e) return;
  $('[data-dlg-title]').textContent = e.title;
  $('[data-dlg-body]').innerHTML = `
    <div class="card-item__tags"><span class="chip">${esc(label(e.category))}</span><span class="chip chip--muted">${esc(label(e.mode))}</span>${statusChip(e)}${e.isDemo ? '<span class="chip chip--demo">Demo data</span>' : ''}</div>
    <p>${esc(e.description)}</p>
    <dl class="kv"><dt>Date</dt><dd>${esc(fmtDate(e.startsAt))}</dd><dt>Time</dt><dd>${esc(fmtTime(e.startsAt))}${e.endsAt ? ` to ${esc(fmtTime(e.endsAt))}` : ''}</dd><dt>Venue</dt><dd>${esc(e.venue)}</dd>
    <dt>Capacity</dt><dd>${e.capacity == null ? 'Not limited' : `${e.registrationCount} of ${e.capacity} registered`}</dd></dl>
    <div class="card-item__actions">${actionButton(e)}</div>`;
  dialog.showModal();
}

list.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.register) act(t.dataset.register, 'POST');
  else if (t.dataset.cancel) act(t.dataset.cancel, 'DELETE');
  else if (t.dataset.details) openDetails(t.dataset.details);
  else if ('retry' in t.dataset) load();
});
$('[data-dlg-body]').addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (t?.dataset.register) act(t.dataset.register, 'POST');
  if (t?.dataset.cancel) act(t.dataset.cancel, 'DELETE');
});
$('[data-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (ev) => { if (ev.target === dialog) dialog.close(); });

const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  if (tab.dataset.view === 'mine' && !state.user) { location.assign('/login?next=/events'); return; }
  state.view = tab.dataset.view;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  filters.hidden = state.view === 'mine';
  reload();
}));

authApi.me().then(({ user }) => { state.user = user; }).catch(() => {}).finally(load);
