import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dOnly, dt, label, badge, pageHead, skeletons, emptyState, errorState, pager, table, qs, debounce, on, modal, field, formError, showFormError, toast, timelineHtml, notice } from '../kit.js';
import { bindForm, maxLength } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/approvals', crumbs: [['Administration'], ['Leave Approvals']], requireAuth: true });
if (!user.permissions.includes('leave:review')) { view.innerHTML = pageHead({ title: 'Leave approvals', eyebrow: 'Restricted' }) + notice('error', 'Only faculty and campus administrators can review leave requests.'); await new Promise(() => {}); }

const state = { page: 1, rows: [] };
view.innerHTML = `${pageHead({ eyebrow: 'Approvals', title: 'Leave approvals', lead: user.role === 'FACULTY' ? 'Requests assigned to you.' : 'All leave requests.' })}
  <form class="toolbar" data-filters role="search" aria-label="Filter leave requests" novalidate>
    ${field({ name: 'status', label: 'Status', type: 'select', placeholder: 'Any status', options: [['SUBMITTED', 'Awaiting decision'], ['INFO_REQUIRED', 'Needs information'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['WITHDRAWN', 'Withdrawn']], value: 'SUBMITTED' })}
    <div class="field"><label class="field__label" for="student">Student name</label><input class="input" id="student" name="student" type="search" maxlength="60"></div>
    ${field({ name: 'from', label: 'Leave ends after', type: 'date' })}${field({ name: 'to', label: 'Leave starts before', type: 'date' })}<button class="button button--secondary" type="reset">Clear</button></form>
  <div data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

async function load() {
  list.innerHTML = skeletons(4, 'skeleton-row');
  try {
    const data = await request(`/manage/leave?${qs({ ...Object.fromEntries(new FormData(filters)), page: state.page })}`);
    state.rows = data.leaves;
    list.innerHTML = data.leaves.length
      ? table([{ label: 'Student', html: (l) => `<strong>${esc(l.student.name)}</strong><br><span class="muted small">${esc(l.student.department || '')}</span>` }, { label: 'Dates', html: (l) => `${esc(dOnly(l.startDate))} to ${esc(dOnly(l.endDate))}<br><span class="muted small">${l.days} day(s) · ${esc(label(l.category))}</span>` }, { label: 'Status', html: (l) => badge(l.status) }, { label: 'Reference', key: 'referenceNo' }, { label: '', html: (l) => `<button class="button button--sm" type="button" data-open="${l.id}">Review</button>` }], data.leaves)
      : emptyState('Nothing to review', 'No leave requests match these filters.');
    pager($('[data-pager]'), data, (p) => { state.page = p; load(); });
  } catch (e) { list.innerHTML = errorState(e.message); }
}

async function open(leaveId) {
  const m = modal({ title: 'Review leave request', body: skeletons(1, 'skeleton-row'), wide: true });
  try {
    const { leave: l, history } = await request(`/leave/${leaveId}`);
    const own = l.studentId === user.id;
    m.body.innerHTML = `<div class="split"><div class="stack"><dl class="kv"><dt>Student</dt><dd>${esc(l.student.name)} ${l.student.registrationNo ? `(${esc(l.student.registrationNo)})` : ''}</dd><dt>Dates</dt><dd>${esc(dOnly(l.startDate))} to ${esc(dOnly(l.endDate))} (${l.days} day${l.days > 1 ? 's' : ''})</dd><dt>Category</dt><dd>${esc(label(l.category))}</dd><dt>Status</dt><dd>${badge(l.status)}</dd><dt>Submitted</dt><dd>${esc(dt(l.createdAt))}</dd><dt>Reason</dt><dd>${esc(l.reason)}</dd></dl><h3 class="section-title">History</h3>${timelineHtml(history)}</div>
      <div>${own ? notice('error', 'You cannot decide your own leave request.') : l.status === 'SUBMITTED' ? `<form class="form" novalidate>${formError}${field({ name: 'note', label: 'Note to the student', type: 'textarea', rows: 3, maxlength: 1000, hint: 'Required when rejecting or asking for information.' })}<div class="stack"><button class="button" type="submit" data-d="APPROVE">Approve</button><button class="button button--secondary" type="submit" data-d="REQUEST_INFO">Ask for more information</button><button class="button button--danger" type="submit" data-d="REJECT">Reject</button></div></form>` : notice('info', l.status === 'INFO_REQUIRED' ? 'Waiting for the student to respond.' : 'This request has already been decided or withdrawn.')}</div></div>`;
    const form = m.body.querySelector('form');
    if (!form) return;
    let decision = 'APPROVE';
    form.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { decision = b.dataset.d; }));
    bindForm(form, { note: [maxLength(1000)] }, async (v) => {
      showFormError(form, '');
      if (decision !== 'APPROVE' && v.note.length < 5) { showFormError(form, 'Please add a note (at least 5 characters).'); return; }
      await request(`/manage/leave/${leaveId}/decision`, { method: 'POST', body: { decision, note: v.note } });
      toast('Decision recorded.');
      m.close();
      load();
    }, { onServerError: (e) => showFormError(form, e.details?.note || e.message) });
  } catch (e) { m.body.innerHTML = errorState(e.message, false); }
}

const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());
on(view, 'click', { '[data-open]': (b) => open(b.dataset.open), '[data-retry]': load });
load();
