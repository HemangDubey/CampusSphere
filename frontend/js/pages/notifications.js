import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, ago, pageHead, skeletons, emptyState, errorState, pager, tabs, attempt, qs, on } from '../kit.js';

const view = $('[data-view]');
await initShell({ active: '/notifications', crumbs: [['Overview'], ['Notifications']], requireAuth: true });

const state = { page: 1, unread: false };
view.innerHTML = `${pageHead({ eyebrow: 'Overview', title: 'Your notifications', lead: 'Updates created by real changes: registrations, decisions on your requests, appointment and leave status.', actions: '<button class="button button--secondary button--sm" type="button" data-read-all>Mark all as read</button>' })}
  <div data-tabs></div><div data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');

const TYPE_LABEL = { EVENT: 'Event', REQUEST: 'Request', LEAVE: 'Leave', APPOINTMENT: 'Appointment', SYSTEM: 'Update' };

async function load() {
  list.innerHTML = skeletons(4, 'skeleton-row');
  try {
    const data = await request(`/notifications?${qs({ page: state.page, unread: state.unread ? 'true' : '' })}`);
    list.innerHTML = data.notifications.length
      ? `<ul class="list card">${data.notifications.map((n) => `<li data-id="${n.id}"><div class="row row--between"><span>${n.readAt ? '' : '<span class="badge badge--warn">New</span> '}<span class="badge badge--muted">${TYPE_LABEL[n.type] || n.type}</span> <strong>${n.link ? `<a href="${esc(n.link)}" data-open>${esc(n.title)}</a>` : esc(n.title)}</strong></span><span class="row"><span class="muted small">${esc(ago(n.createdAt))}</span>${n.readAt ? '' : '<button class="button button--ghost button--sm" type="button" data-read>Mark read</button>'}</span></div>${n.body ? `<span class="muted small">${esc(n.body)}</span>` : ''}</li>`).join('')}</ul>`
      : emptyState(state.unread ? 'No unread notifications' : 'No notifications yet', 'When something changes on an event, request, leave or appointment, you will see it here.');
    pager($('[data-pager]'), data, (p) => { state.page = p; load(); });
    window.dispatchEvent(new Event('cs:notifications-changed'));
  } catch (e) { list.innerHTML = errorState(e.message); }
}

tabs($('[data-tabs]'), [['all', 'All'], ['unread', 'Unread']], 'all', (t) => { state.unread = t === 'unread'; state.page = 1; load(); });
on(view, 'click', {
  '[data-read]': async (btn) => { await attempt(() => request(`/notifications/${btn.closest('li').dataset.id}/read`, { method: 'POST' })); load(); },
  '[data-open]': async (a) => { try { await request(`/notifications/${a.closest('li').dataset.id}/read`, { method: 'POST' }); } catch { /* navigate anyway */ } },
  '[data-read-all]': async () => { await attempt(() => request('/notifications/read-all', { method: 'POST' }), { success: 'All notifications marked as read.' }); load(); },
  '[data-retry]': load
});
load();
