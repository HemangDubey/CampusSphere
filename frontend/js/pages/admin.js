import { initShell, ROLE_LABELS, icon } from '../shell.js';
import { request } from '../api.js';
import { $, esc, pageHead, skeletons, errorState, notice, on } from '../kit.js';

const view = $('[data-view]');
const user = await initShell({ active: '/admin', crumbs: [['Administration'], ['Admin Dashboard']], requireAuth: true });
if (!user.permissions.length) { view.innerHTML = pageHead({ title: 'Administration', eyebrow: 'Restricted' }) + notice('error', 'Your account does not have administrative permissions.'); await new Promise(() => {}); }
const can = (p) => user.permissions.includes(p);

const TOOLS = [
  ['event:manage', '/admin/events', 'calendar', 'Event management', 'Create, publish and run events; see attendees and attendance.'],
  ['leave:review', '/approvals', 'leave', 'Leave approvals', 'Review and decide leave requests.'],
  ['request:review', '/admin/requests', 'inbox', 'Request queue', 'Assign, review and decide service requests.'],
  ['healthcare:manage', '/admin/healthcare', 'stethoscope', 'Healthcare management', 'Appointments, services, providers and availability.'],
  ['resource:manage', '/admin/resources', 'folder', 'Resource management', 'Directory entries, categories and request forms.'],
  ['content:manage', '/admin/content', 'map', 'Content and announcements', 'Travel destinations and campus announcements.'],
  ['employee:manage', '/employees', 'briefcase', 'Employee records', 'Employee profiles (administrators only).'],
  ['user:manage', '/admin/users', 'userCog', 'Users and roles', 'Roles, suspension and reactivation.'],
  ['report:view', '/admin/reports', 'chart', 'Reports and audit logs', 'Live operational numbers and the audit trail.']
].filter(([p]) => can(p));

view.innerHTML = `${pageHead({ eyebrow: ROLE_LABELS[user.role], title: 'Administration', lead: 'The tools your role can use. Everything here is enforced by the server, not just hidden in the menu.' })}<div data-work class="stack-lg"></div>
  <h2 class="section-title" style="margin-top:24px">Your tools</h2><div class="grid grid--cards">${TOOLS.map(([, href, ic, title, text]) => `<a class="card card--link" href="${href}">${icon(ic, 26)}<h3>${esc(title)}</h3><p>${esc(text)}</p></a>`).join('')}</div>`;

async function work() {
  const box = $('[data-work]');
  box.innerHTML = skeletons(1, 'skeleton-row');
  try {
    const d = await request('/dashboard');
    const parts = [];
    if (d.work) parts.push(`<a class="stat card--link" href="/approvals"><span class="stat__n">${d.work.leavesToReview}</span><span class="stat__l">Leave to review</span></a><a class="stat card--link" href="/admin/requests"><span class="stat__n">${d.work.requestsToReview}</span><span class="stat__l">Requests to review</span></a><a class="stat card--link" href="/admin/requests?overdue=true"><span class="stat__n">${d.work.overdueRequests}</span><span class="stat__l">Overdue requests</span></a>`);
    if (can('report:view')) {
      const r = await request('/admin/reports');
      parts.push(`<div class="stat"><span class="stat__n">${r.registrations.REGISTERED || 0}</span><span class="stat__l">Active registrations</span></div><div class="stat"><span class="stat__n">${Object.values(r.appointments).reduce((a, b) => a + b, 0)}</span><span class="stat__l">Appointment requests</span></div>`);
    }
    box.innerHTML = parts.length ? `<div class="grid grid--stats">${parts.join('')}</div>` : '';
  } catch (e) { box.innerHTML = errorState(e.message); }
}
on(view, 'click', { '[data-retry]': work });
work();
