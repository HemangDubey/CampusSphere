import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dt, badge, pageHead, skeletons, emptyState, errorState, tabs, on } from '../kit.js';

const view = $('[data-view]');
await initShell({ active: '/requests', crumbs: [['Services'], ['Service Requests']], requireAuth: true });
let status = '';

view.innerHTML = `${pageHead({ eyebrow: 'Services', title: 'My service requests', lead: 'Every request you have sent to campus services, with its reference number and current status.', actions: '<a class="button" href="/resources?requestable=true">New request</a>' })}
  <div data-tabs></div><div data-list aria-live="polite"></div>`;
const list = $('[data-list]');

async function load() {
  list.innerHTML = skeletons(3, 'skeleton-row');
  try {
    const { requests } = await request(`/service-requests/mine${status ? `?status=${status}` : ''}`);
    list.innerHTML = requests.length
      ? `<div class="grid grid--cards">${requests.map((r) => `<a class="card card--link" href="/requests/${r.id}"><div class="row row--between">${badge(r.status)}${r.overdue ? badge('REJECTED', 'Overdue') : ''}</div><h3>${esc(r.resource.title)}</h3><p class="small">Reference <strong>${esc(r.referenceNo)}</strong><br>Submitted ${esc(dt(r.createdAt))}</p>${r.status === 'INFO_REQUIRED' ? '<p class="small"><strong>Action needed:</strong> staff asked for more information.</p>' : ''}</a>`).join('')}</div>`
      : emptyState(status ? 'No requests with that status' : 'No requests yet', 'Browse campus services to send your first request, such as an enrolment letter or IT help.', '<a class="button button--sm" href="/resources?requestable=true">See services you can request</a>');
  } catch (e) { list.innerHTML = errorState(e.message); }
}
tabs($('[data-tabs]'), [['', 'All'], ['SUBMITTED', 'Submitted'], ['UNDER_REVIEW', 'Under review'], ['INFO_REQUIRED', 'Needs information'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['CANCELLED', 'Cancelled']].map(([v, l]) => [v || 'all', l]), 'all', (t) => { status = t === 'all' ? '' : t; load(); });
on(view, 'click', { '[data-retry]': load });

load();
