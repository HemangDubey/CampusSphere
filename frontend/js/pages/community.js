import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, ago, sample, cover, pageHead, skeletons, emptyState, errorState, on } from '../kit.js';

const view = $('[data-view]');
await initShell({ active: '/community', crumbs: [['Campus Life'], ['Student Community']] });

async function load() {
  view.innerHTML = `${pageHead({ eyebrow: 'Campus life', title: 'Student community', lead: 'Announcements from campus administrators, clubs and societies, and what is coming up.' })}<div class="split"><section><h2 class="section-title">Clubs and societies</h2><div class="grid grid--2" data-clubs>${skeletons(2, 'skeleton-row')}</div></section><aside class="stack-lg"><section class="card"><h2 class="section-title">Announcements</h2><div data-ann>${skeletons(2, 'skeleton-row')}</div></section><section class="card"><h2 class="section-title">Coming up</h2><div data-events>${skeletons(2, 'skeleton-row')}</div></section></aside></div>`;
  const [clubs, ann, events] = await Promise.allSettled([request('/resources?kind=CLUB&pageSize=50'), request('/announcements'), request('/events?pageSize=4&sort=date')]);
  $('[data-clubs]').innerHTML = clubs.status === 'fulfilled'
    ? (clubs.value.resources.length ? clubs.value.resources.map((c) => `<a class="card card--flush card--link" href="/resources/${c.id}">${cover(c.imageUrl, c.title, 'CLUB', 'cover--thumb')}<div class="card__body"><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p>${c.isDemo ? sample : ''}</div></a>`).join('') : emptyState('No clubs listed', 'Administrators can add clubs and societies in Resource Management.'))
    : errorState(clubs.reason.message);
  $('[data-ann]').innerHTML = ann.status === 'fulfilled'
    ? (ann.value.announcements.length ? `<ul class="list">${ann.value.announcements.map((a) => `<li><strong>${esc(a.title)}</strong><span class="muted small">${esc(a.body)}</span><span class="muted small">${esc(ago(a.publishedAt || a.createdAt))}${a.isDemo ? ' · sample' : ''}</span></li>`).join('')}</ul>` : emptyState('No announcements', 'Nothing has been posted yet.'))
    : errorState(ann.reason.message);
  $('[data-events]').innerHTML = events.status === 'fulfilled'
    ? (events.value.events.length ? `<ul class="list">${events.value.events.map((e) => `<li><a href="/events/${e.id}"><strong>${esc(e.title)}</strong></a><span class="muted small">${esc(new Date(e.startsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))} · ${esc(e.venue)}</span></li>`).join('')}</ul><a class="auth__link small" href="/events">All events</a>` : emptyState('No upcoming events', 'Check back soon.'))
    : errorState(events.reason.message);
}
on(view, 'click', { '[data-retry]': load });
load();
