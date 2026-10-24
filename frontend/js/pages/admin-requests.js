import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dt, badge, pageHead, skeletons, emptyState, errorState, pager, table, qs, debounce, on, modal, field, formError, showFormError, toast, timelineHtml, notice, attempt } from '../kit.js';
import { bindForm, maxLength } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/admin/requests', crumbs: [['Administration'], ['Request Queue']], requireAuth: true });
if (!user.permissions.includes('request:review')) { view.innerHTML = pageHead({ title: 'Request queue', eyebrow: 'Restricted' }) + notice('error', 'Only faculty and administrators can review service requests.'); await new Promise(() => {}); }
const isAdmin = ['CAMPUS_ADMIN', 'SUPER_ADMIN'].includes(user.role);
const state = { page: 1, rows: [], handlers: [] };
const params = new URLSearchParams(location.search);

view.innerHTML = `${pageHead({ eyebrow: 'Administration', title: 'Request queue', lead: isAdmin ? 'Route, review and decide service requests.' : 'Requests assigned to you.' })}<div data-overdue></div>
  <form class="toolbar" data-filters role="search" novalidate><div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="60" placeholder="Reference, student or service"></div>
  ${field({ name: 'status', label: 'Status', type: 'select', placeholder: 'Any status', options: [['SUBMITTED', 'Submitted'], ['UNDER_REVIEW', 'Under review'], ['INFO_REQUIRED', 'Needs information'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['CANCELLED', 'Cancelled']] })}
  ${isAdmin ? field({ name: 'assigned', label: 'Handler', type: 'select', placeholder: 'Anyone', options: [['me', 'Assigned to me'], ['unassigned', 'Unassigned']] }) : ''}
  <label class="check"><input type="checkbox" name="overdue" value="true" ${params.get('overdue') === 'true' ? 'checked' : ''}><span>Overdue only</span></label><button class="button button--secondary" type="reset">Clear</button></form>
  <div data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

async function load() {
  list.innerHTML = skeletons(4, 'skeleton-row');
  try {
    const data = await request(`/manage/requests?${qs({ ...Object.fromEntries(new FormData(filters)), page: state.page })}`);
    state.rows = data.requests;
    $('[data-overdue]').innerHTML = data.overdueCount ? notice('error', `${data.overdueCount} request${data.overdueCount === 1 ? ' is' : 's are'} past the target date (demonstration target of 5 days).`) : '';
    list.innerHTML = data.requests.length ? table([
      { label: 'Request', html: (r) => `<strong>${esc(r.resource.title)}</strong><br><span class="muted small">${esc(r.referenceNo)}</span>` },
      { label: 'Requester', html: (r) => `${esc(r.requester.name)}<br><span class="muted small">${esc(r.requester.department || '')}</span>` },
      { label: 'Status', html: (r) => `${badge(r.status)}${r.overdue ? ` ${badge('REJECTED', 'Overdue')}` : ''}` },
      { label: 'Handler', html: (r) => esc(r.assignee?.name || 'Unassigned') }, { label: 'Submitted', html: (r) => esc(dt(r.createdAt)) },
      { label: '', html: (r) => `<button class="button button--sm" type="button" data-open="${r.id}">Open</button>` }
    ], data.requests) : emptyState('Queue is clear', 'No requests match these filters.');
    pager($('[data-pager]'), data, (p) => { state.page = p; load(); });
  } catch (e) { list.innerHTML = errorState(e.message); }
}

async function open(id) {
  const m = modal({ title: 'Request', body: skeletons(1, 'skeleton-row'), wide: true });
  try {
    const { request: r, formFields, history } = await request(`/service-requests/${id}`);
    if (isAdmin && !state.handlers.length) ({ handlers: state.handlers } = await request('/manage/requests/handlers'));
    const own = r.requesterId === user.id;
    const next = { SUBMITTED: [['UNDER_REVIEW', 'Start review']], UNDER_REVIEW: [['INFO_REQUIRED', 'Ask for information'], ['APPROVED', 'Approve'], ['REJECTED', 'Reject']], INFO_REQUIRED: [['REJECTED', 'Reject']] }[r.status] || [];
    m.body.innerHTML = `<div class="split"><div class="stack"><div class="row">${badge(r.status)}${r.overdue ? badge('REJECTED', 'Overdue') : ''}<span class="muted small">${esc(r.referenceNo)}</span></div><h3 style="margin:0">${esc(r.resource.title)}</h3>
      <dl class="kv"><dt>Requester</dt><dd>${esc(r.requester.name)} (${esc(r.requester.email)})</dd>${(formFields.length ? formFields : Object.keys(r.data).map((k) => ({ name: k, label: k }))).map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(r.data[f.name] ?? 'Not provided')}</dd>`).join('')}</dl><h4 class="section-title">History</h4>${timelineHtml(history)}</div>
      <div class="stack">${own ? notice('error', 'You cannot review your own request.') : `
        ${isAdmin ? `<form class="form" data-assign novalidate>${field({ name: 'assigneeId', label: 'Handler', type: 'select', options: state.handlers.map((h) => [h.id, `${h.name} (${h.role.replace('_', ' ').toLowerCase()})`]), value: r.assigneeId })}<button class="button button--secondary button--sm" type="submit" ${['APPROVED', 'REJECTED', 'CANCELLED'].includes(r.status) ? 'disabled' : ''}>Assign</button></form>` : ''}
        ${next.length ? `<form class="form" data-transition novalidate>${formError}${field({ name: 'note', label: 'Note to the requester', type: 'textarea', rows: 3, maxlength: 1000, hint: 'Required when rejecting or asking for information.' })}<div class="stack">${next.map(([to, text]) => `<button class="button ${to === 'REJECTED' ? 'button--danger' : to === 'APPROVED' ? '' : 'button--secondary'}" type="submit" data-to="${to}">${text}</button>`).join('')}</div></form>` : notice('info', 'This request is closed.')}`}</div></div>`;
    const assign = m.body.querySelector('[data-assign]');
    assign?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const aid = assign.elements.assigneeId.value;
      if (!aid) { toast('Choose a handler.', 'error'); return; }
      if (await attempt(() => request(`/manage/requests/${id}/assign`, { method: 'POST', body: { assigneeId: aid } }), { success: 'Handler assigned.' })) { m.close(); load(); }
    });
    const form = m.body.querySelector('[data-transition]');
    if (form) {
      let to = '';
      form.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => { to = b.dataset.to; }));
      bindForm(form, { note: [maxLength(1000)] }, async (v) => {
        showFormError(form, '');
        if (['INFO_REQUIRED', 'REJECTED'].includes(to) && v.note.length < 5) { showFormError(form, 'Please add a note (at least 5 characters).'); return; }
        await request(`/manage/requests/${id}/transition`, { method: 'POST', body: { to, note: v.note } });
        toast('Status updated.');
        m.close();
        load();
      }, { onServerError: (e) => showFormError(form, e.details?.note || e.message) });
    }
  } catch (e) { m.body.innerHTML = errorState(e.message, false); }
}

const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());
on(view, 'click', { '[data-open]': (b) => open(b.dataset.open), '[data-retry]': load });
load();
