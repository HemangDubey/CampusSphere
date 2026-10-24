import { initShell, ROLE_LABELS } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dOnly, badge, pageHead, skeletons, emptyState, errorState, pager, table, qs, debounce, on, field, toast, notice, confirmDialog } from '../kit.js';

const view = $('[data-view]');
const user = await initShell({ active: '/admin/users', crumbs: [['Administration'], ['Users & Roles']], requireAuth: true });
if (!user.permissions.includes('user:manage')) { view.innerHTML = pageHead({ title: 'Users and roles', eyebrow: 'Restricted' }) + notice('error', 'Only super administrators can manage users and roles.'); await new Promise(() => {}); }
const state = { page: 1, rows: [], roles: [] };

view.innerHTML = `${pageHead({ eyebrow: 'Administration', title: 'Users and roles', lead: 'Change roles and suspend or reactivate accounts. Changes take effect immediately and are written to the audit log.' })}
  ${notice('info', 'Public registration only creates student accounts. Staff roles are assigned here, or with the server-side provisioning script for the very first administrator.')}
  <section class="card" style="margin-top:12px"><h2 class="section-title">Role requests</h2><div data-requests aria-live="polite"></div></section>
  <form class="toolbar" data-filters role="search" novalidate style="margin-top:12px"><div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="60" placeholder="Name or email"></div>
  <div class="field"><label class="field__label" for="role">Role</label><select class="select" id="role" name="role"><option value="">All roles</option></select></div>
  ${field({ name: 'status', label: 'Status', type: 'select', placeholder: 'Any', options: [['ACTIVE', 'Active'], ['SUSPENDED', 'Suspended']] })}<button class="button button--secondary" type="reset">Clear</button></form>
  <div data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

async function load() {
  list.innerHTML = skeletons(5, 'skeleton-row');
  try {
    const data = await request(`/admin/users?${qs({ ...Object.fromEntries(new FormData(filters)), page: state.page })}`);
    state.rows = data.users;
    if (!state.roles.length) { state.roles = data.roles; $('#role').insertAdjacentHTML('beforeend', data.roles.map((r) => `<option value="${r}">${esc(ROLE_LABELS[r])}</option>`).join('')); }
    list.innerHTML = data.users.length ? table([
      { label: 'User', html: (u) => `<strong>${esc(u.name)}</strong>${u.id === user.id ? ' <span class="muted small">(you)</span>' : ''}<br><span class="muted small">${esc(u.email)}</span>` },
      { label: 'Joined', html: (u) => esc(dOnly(u.createdAt)) }, { label: 'Status', html: (u) => badge(u.status) },
      { label: 'Role', html: (u) => (u.id === user.id ? esc(ROLE_LABELS[u.role]) : `<select class="select" data-role="${u.id}" aria-label="Role for ${esc(u.name)}">${data.roles.map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${esc(ROLE_LABELS[r])}</option>`).join('')}</select>`) },
      { label: '', html: (u) => (u.id === user.id ? '' : `<button class="button button--secondary button--sm" type="button" data-status="${u.id}">${u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button>`) }
    ], data.users) : emptyState('No users match', 'Try another search.');
    pager($('[data-pager]'), data, (p) => { state.page = p; load(); });
  } catch (e) { list.innerHTML = errorState(e.message); }
}

async function loadRequests() {
  const box = $('[data-requests]');
  try {
    const { requests } = await request('/admin/role-requests?status=PENDING');
    box.innerHTML = requests.length ? `<ul class="list">${requests.map((r) => `<li data-rid="${r.id}"><strong>${esc(r.user.name)}</strong><span class="muted small">${esc(r.user.email)} · asked for ${esc(ROLE_LABELS[r.requestedRole])} · now ${esc(ROLE_LABELS[r.user.role])}</span><span class="row"><button class="button button--sm" type="button" data-decide="approve">Approve</button><button class="button button--secondary button--sm" type="button" data-decide="reject">Decline</button></span></li>`).join('')}</ul>` : '<p class="muted small">No pending role requests. People choose a role on the registration form; anything other than Student waits here for approval.</p>';
  } catch (e) { box.innerHTML = errorState(e.message); }
}

view.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-decide]');
  if (!b) return;
  const id = b.closest('[data-rid]').dataset.rid;
  const approve = b.dataset.decide === 'approve';
  if (!(await confirmDialog({ title: approve ? 'Grant this role?' : 'Decline this request?', message: approve ? 'The person gets staff access immediately and must sign in again.' : 'The person stays a student and is told the request was declined.', confirmLabel: approve ? 'Approve' : 'Decline', danger: !approve }))) return;
  try { await request(`/admin/role-requests/${id}/decision`, { method: 'POST', body: { decision: b.dataset.decide } }); toast(approve ? 'Role approved.' : 'Request declined.'); } catch (err) { toast(err.message, 'error'); }
  loadRequests();
  load();
});

async function patch(id, body, success) {
  try { await request(`/admin/users/${id}`, { method: 'PATCH', body }); toast(success); } catch (e) { toast(e.message, 'error'); }
  load();
}

view.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-role]');
  if (!sel) return;
  const u = state.rows.find((x) => x.id === sel.dataset.role);
  if (!(await confirmDialog({ title: 'Change role?', message: `${u.name} will become ${ROLE_LABELS[sel.value]}. Their current sessions end immediately and they must sign in again.`, confirmLabel: 'Change role' }))) { load(); return; }
  patch(u.id, { role: sel.value }, 'Role updated.');
});
on(view, 'click', {
  '[data-status]': async (b) => {
    const u = state.rows.find((x) => x.id === b.dataset.status);
    const suspend = u.status === 'ACTIVE';
    if (!(await confirmDialog({ title: suspend ? 'Suspend this account?' : 'Reactivate this account?', message: suspend ? `${u.name} will be signed out and unable to sign in until reactivated.` : `${u.name} will be able to sign in again.`, confirmLabel: suspend ? 'Suspend' : 'Reactivate', danger: suspend }))) return;
    patch(u.id, { status: suspend ? 'SUSPENDED' : 'ACTIVE' }, suspend ? 'Account suspended.' : 'Account reactivated.');
  },
  '[data-retry]': load
});
const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());
load();
loadRequests();
