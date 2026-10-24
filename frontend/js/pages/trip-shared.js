import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, inr, dOnly, skeletons, errorState } from '../kit.js';

const view = $('[data-view]');
const token = location.pathname.split('/').filter(Boolean)[2];
await initShell({ active: '/trips', crumbs: [['Campus Life'], ['Travel Explorer', '/travel'], ['Shared trip']] });

try {
  view.innerHTML = skeletons(2);
  const { trip } = await request(`/trips/shared/${encodeURIComponent(token)}`);
  const days = {};
  trip.items.forEach((i) => { (days[i.dayNumber] ||= []).push(i); });
  document.title = `${trip.title} | CampusSphere`;
  view.innerHTML = `<div class="page-head"><div><span class="label label--accent">Shared by ${esc(trip.ownerName)} · view only</span><h1 class="page-head__title" style="font-size:clamp(28px,4vw,52px)">${esc(trip.title)}</h1>
    <p class="page-head__lead">${esc(trip.destination?.name || '')}${trip.startDate ? ` · ${esc(dOnly(trip.startDate))} to ${esc(dOnly(trip.endDate || trip.startDate))}` : ''}</p></div></div>
    <div class="split"><section class="card">${trip.items.length ? Object.keys(days).sort((a, b) => a - b).map((d) => `<h3 class="small muted">Day ${d}</h3><ul class="list">${days[d].map((i) => `<li><strong>${esc(i.title)}</strong><span class="muted small">${esc(inr(i.estCostInr))}${i.notes ? ` · ${esc(i.notes)}` : ''}</span></li>`).join('')}</ul>`).join('') : '<p class="muted">This trip has no items yet.</p>'}</section>
    <aside class="card"><h2 class="section-title">Estimated total</h2><p class="stat__n">${esc(inr(trip.estimatedTotalInr))}</p><p class="small muted">Estimates only. <a class="auth__link" href="/login?next=/trips">Sign in</a> to plan your own trips.</p></aside></div>`;
} catch (e) {
  view.innerHTML = errorState(e.status === 404 ? 'This shared trip link is not valid or sharing has been turned off.' : e.message, e.status !== 404);
}
