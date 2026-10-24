import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, dt, badge, cover, skeletons, errorState, inr, on, attempt, confirmDialog, toast, notice } from '../kit.js';
import { openRegistration } from '../event-register.js';

const view = $('[data-view]');
const id = location.pathname.split('/').filter(Boolean)[1];
const user = await initShell({ active: '/events', crumbs: [['Campus Life'], ['Events & Symposiums', '/events'], ['Event']] });
let current;

const lines = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean);

function render({ event: e, related }) {
  current = e;
  document.title = `${e.title} | CampusSphere`;
  const action = e.registered
    ? `<div class="row">${badge('REGISTERED', 'You are registered')}${e.canCancel ? '<button class="button button--secondary" type="button" data-cancel>Cancel registration</button>' : ''}</div>`
    : e.registrationOpen ? '<button class="button button--lg" type="button" data-register>Register now</button>'
      : `<div>${badge(e.status === 'CANCELLED' ? 'CANCELLED' : 'UNAVAILABLE', e.status === 'CANCELLED' ? 'Cancelled' : 'Registration unavailable')}<p class="small muted">${esc(e.registrationNote || '')}</p></div>`;
  const when = e.endsAt ? `${dt(e.startsAt)} to ${new Date(e.endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : dt(e.startsAt);
  const util = e.capacity == null ? 'No seat limit' : `${e.registrationCount} of ${e.capacity} seats taken`;
  view.innerHTML = `<div class="hero-detail">
    ${cover(e.coverImage, e.title, e.category, 'cover--tall')}
    <div class="split"><div class="stack-lg">
      <div><div class="chips"><span class="badge badge--muted">${esc(label(e.category))}</span><span class="badge badge--muted">${esc(label(e.mode))}</span>${e.status === 'CANCELLED' ? badge('CANCELLED') : ''}</div>
        <h1 class="page-head__title" style="font-size:clamp(30px,4.5vw,58px)">${esc(e.title)}</h1><p class="page-head__lead">${esc(e.description)}</p></div>
      ${e.status === 'CANCELLED' ? notice('error', `This event was cancelled.${e.cancelReason ? ` Reason: ${e.cancelReason}` : ''}`) : ''}
      ${lines(e.schedule).length ? `<section class="card"><h2 class="section-title">Schedule</h2><ul class="list">${lines(e.schedule).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>` : ''}
      ${e.eligibility || e.instructions ? `<section class="card"><h2 class="section-title">Eligibility and participation</h2>${e.eligibility ? `<p><strong>Who can join:</strong> ${esc(e.eligibility)}</p>` : ''}${e.instructions ? `<p><strong>What to do:</strong> ${esc(e.instructions)}</p>` : ''}</section>` : ''}
      ${related.length ? `<section><h2 class="section-title">Related events</h2><div class="grid grid--3">${related.map((r) => `<a class="card card--link" href="/events/${r.id}"><strong>${esc(r.title)}</strong><span class="muted small">${esc(dt(r.startsAt))}</span></a>`).join('')}</div></section>` : ''}
    </div>
    <aside class="card" aria-label="Registration">
      ${action}
      ${e.myRegistration ? `<p class="small">Reference <strong>${esc(e.myRegistration.referenceNo)}</strong></p>` : ''}
      <dl class="kv"><dt>When</dt><dd>${esc(when)}</dd><dt>Where</dt><dd>${esc(e.venue)}</dd>
        ${e.onlineLink && e.registered ? `<dt>Join link</dt><dd><a class="auth__link" href="${esc(e.onlineLink)}" rel="noopener noreferrer" target="_blank">Open online session</a></dd>` : e.onlineLink ? '<dt>Online</dt><dd>The link is shown after you register.</dd>' : ''}
        <dt>Organizer</dt><dd>${esc(e.organizerDisplay || 'Not specified')}</dd>
        <dt>Seats</dt><dd>${esc(util)}${e.spotsLeft != null ? ` (${e.spotsLeft} left)` : ''}</dd>
        ${e.capacity ? `<dt></dt><dd><div class="meter" aria-hidden="true"><span style="width:${Math.min(100, Math.round((e.registrationCount / e.capacity) * 100))}%"></span></div></dd>` : ''}
        <dt>Registration</dt><dd>${e.registrationOpensAt ? `Opens ${esc(dt(e.registrationOpensAt))}<br>` : ''}Closes ${esc(dt(e.registrationClosesAt || e.startsAt))}</dd>
        <dt>Fee</dt><dd>${e.fee > 0 ? `${esc(inr(e.fee))} (demonstration only, no payment is taken)` : 'Free'}</dd></dl>
      <button class="button button--secondary button--sm" type="button" data-share>Copy link to share</button>
    </aside></div></div>`;
}

async function load() {
  view.innerHTML = skeletons(2);
  try { render(await request(`/events/${id}`)); } catch (e) { view.innerHTML = `<p><a class="auth__link" href="/events">&larr; All events</a></p>${errorState(e.status === 404 ? 'We could not find that event. It may have been removed or is not published.' : e.message, e.status !== 404)}`; }
}

on(view, 'click', {
  '[data-register]': () => openRegistration(current, user, load),
  '[data-cancel]': async () => {
    if (!(await confirmDialog({ title: 'Cancel registration?', message: `You will give up your seat for "${current.title}".`, confirmLabel: 'Cancel registration', danger: true }))) return;
    await attempt(() => request(`/events/${id}/register`, { method: 'DELETE' }), { success: 'Registration cancelled.' });
    load();
  },
  '[data-share]': async () => {
    const url = `${location.origin}/events/${id}`;
    try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { window.prompt('Copy this link', url); }
  },
  '[data-retry]': load
});
load();
