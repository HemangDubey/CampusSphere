import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dt, badge, pageHead, skeletons, emptyState, errorState, on } from '../kit.js';

const view = $('[data-view]');
await initShell({ active: '/activity', crumbs: [['Overview'], ['My Activity']], requireAuth: true });

const KIND = { EVENT: 'Event', SERVICE_REQUEST: 'Request', LEAVE: 'Leave', APPOINTMENT: 'Appointment' };

async function load() {
  view.innerHTML = `${pageHead({ eyebrow: 'Overview', title: 'My activity', lead: 'A history of what you did and what happened to your items, newest first.' })}<div data-list>${skeletons(5, 'skeleton-row')}</div>`;
  try {
    const { activity } = await request('/activity');
    $('[data-list]').innerHTML = activity.length
      ? `<ol class="timeline card">${activity.map((a) => `<li><span class="timeline__dot"></span><div><a href="${esc(a.link)}"><strong>${esc(a.text)}</strong></a><br><span class="timeline__who">${badge('', KIND[a.kind] || a.kind).replace('badge--muted', 'badge--muted')} ${esc(dt(a.at))}</span></div></li>`).join('')}</ol>`
      : emptyState('No activity yet', 'Register for an event, submit a request or book an appointment and it will appear here.', '<a class="button button--sm" href="/events">Browse events</a>');
  } catch (e) { $('[data-list]').innerHTML = errorState(e.message); }
}
on(view, 'click', { '[data-retry]': load });
load();
