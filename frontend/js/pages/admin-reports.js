import { initShell, ROLE_LABELS } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dt, label, pageHead, skeletons, emptyState, errorState, pager, table, qs, debounce, on, field, notice, tabs } from '../kit.js';

const view = $('[data-view]');
const user = await initShell({ active: '/admin/reports', crumbs: [['Administration'], ['Reports & Audit Logs']], requireAuth: true });
const canReports = user.permissions.includes('report:view');
const canAudit = user.permissions.includes('audit:view');
if (!canReports && !canAudit) { view.innerHTML = pageHead({ title: 'Reports and audit', eyebrow: 'Restricted' }) + notice('error', 'Only campus and super administrators can see reports and audit logs.'); await new Promise(() => {}); }

view.innerHTML = `${pageHead({ eyebrow: 'Administration', title: 'Reports and audit logs', lead: 'Operational numbers calculated live from the database, and a record of administrative actions.' })}<div data-tabs></div><div data-panel></div>`;
const panel = $('[data-panel]');

const stat = (n, l) => `<div class="stat"><span class="stat__n">${esc(n)}</span><span class="stat__l">${esc(l)}</span></div>`;
const kv = (o) => (Object.keys(o || {}).length ? `<dl class="kv">${Object.entries(o).map(([k, v]) => `<dt>${esc(label(k))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : '<p class="muted small">No data yet.</p>');

async function reports() {
  panel.innerHTML = skeletons(3);
  try {
    const r = await request('/admin/reports');
    const u = Object.values(r.users).reduce((a, b) => a + b, 0);
    panel.innerHTML = `<p class="small muted">Generated ${esc(dt(r.generatedAt))}</p><div class="grid grid--stats">${stat(u, 'Users')}${stat(r.events.PUBLISHED || 0, 'Published events')}${stat(r.registrations.REGISTERED || 0, 'Active registrations')}${stat(r.serviceRequests.overdue, 'Overdue requests')}${stat(Object.values(r.appointments).reduce((a, b) => a + b, 0), 'Appointment requests')}${stat(r.gamePlays, 'Games played')}</div>
      <div class="grid grid--2" style="margin-top:16px"><section class="card"><h2 class="section-title">Users by role</h2>${kv(Object.fromEntries(Object.entries(r.users).map(([k, v]) => [ROLE_LABELS[k] || k, v])))}</section>
        <section class="card"><h2 class="section-title">Service requests</h2>${kv(r.serviceRequests.byStatus)}</section><section class="card"><h2 class="section-title">Leave requests</h2>${kv(r.leave)}</section><section class="card"><h2 class="section-title">Appointments</h2>${kv(r.appointments)}</section>
        <section class="card"><h2 class="section-title">Registrations by category</h2>${kv(r.registrationsByCategory)}</section>
        <section class="card"><h2 class="section-title">Most registered events</h2>${r.topEvents.length ? `<ul class="list">${r.topEvents.map((e) => `<li><a href="/events/${e.id}">${esc(e.title)}</a><span class="muted small">${e.registered} registered${e.utilization != null ? ` · ${e.utilization}% of capacity` : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">No published events.</p>'}</section></div>`;
  } catch (e) { panel.innerHTML = errorState(e.message); }
}

async function audit() {
  const state = { page: 1 };
  panel.innerHTML = `<form class="toolbar" data-f role="search" novalidate><div class="field field--wide"><label class="field__label" for="q">Search the log</label><input class="input" id="q" name="q" type="search" maxlength="60" placeholder="Action or summary"></div><div class="field"><label class="field__label" for="entityType">Record type</label><select class="select" id="entityType" name="entityType"><option value="">All</option></select></div><button class="button button--secondary" type="reset">Clear</button></form><div data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
  const f = panel.querySelector('[data-f]');
  const draw = async () => {
    const list = panel.querySelector('[data-list]');
    list.innerHTML = skeletons(5, 'skeleton-row');
    try {
      const data = await request(`/admin/audit?${qs({ ...Object.fromEntries(new FormData(f)), page: state.page })}`);
      const sel = panel.querySelector('#entityType');
      if (sel.options.length === 1) sel.insertAdjacentHTML('beforeend', data.entityTypes.map((t) => `<option>${esc(t)}</option>`).join(''));
      list.innerHTML = data.logs.length ? table([{ label: 'When', html: (l) => esc(dt(l.createdAt)) }, { label: 'Who', html: (l) => (l.actor ? `${esc(l.actor.name)}<br><span class="muted small">${esc(ROLE_LABELS[l.actor.role] || l.actor.role)}</span>` : '<span class="muted">System / script</span>') }, { label: 'Action', html: (l) => `<code>${esc(l.action)}</code>` }, { label: 'What happened', key: 'summary' }], data.logs) : emptyState('No audit entries', 'Administrative actions will be recorded here.');
      pager(panel.querySelector('[data-pager]'), data, (p) => { state.page = p; draw(); });
    } catch (e) { list.innerHTML = errorState(e.message); }
  };
  const reload = () => { state.page = 1; draw(); };
  f.addEventListener('input', debounce(reload, 300));
  f.addEventListener('change', reload);
  f.addEventListener('reset', () => setTimeout(reload));
  f.addEventListener('submit', (e) => e.preventDefault());
  draw();
}

const items = [canReports && ['reports', 'Reports'], canAudit && ['audit', 'Audit log']].filter(Boolean);
tabs($('[data-tabs]'), items, items[0][0], (t) => (t === 'reports' ? reports() : audit()));
on(view, 'click', { '[data-retry]': () => (items[0][0] === 'reports' ? reports() : audit()) });
(items[0][0] === 'reports' ? reports : audit)();
