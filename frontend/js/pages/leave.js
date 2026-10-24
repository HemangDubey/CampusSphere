import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dOnly, label, badge, pageHead, skeletons, emptyState, errorState, tabs, on, modal, fields, formRow, formError, showFormError, notice, toast, disclosure } from '../kit.js';
import { bindForm, required, minLength, maxLength, oneOf } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/leave', crumbs: [['Services'], ['Leave & Approvals']], requireAuth: true });
let status = '';
let rules = { maxDays: 30 };
const CATS = ['MEDICAL', 'PERSONAL', 'FAMILY', 'ACADEMIC', 'OTHER'];

view.innerHTML = `${pageHead({ eyebrow: 'Services', title: 'Leave requests', lead: 'Ask a faculty member or administrator to approve time away and follow the decision here.', actions: `<button class="button" type="button" data-new>New leave request</button>${user.permissions.includes('leave:review') ? ' <a class="button button--secondary" href="/approvals">Review requests</a>' : ''}` })}
  <div data-rules></div><div data-tabs></div><div data-list aria-live="polite"></div>`;
const list = $('[data-list]');

async function load() {
  list.innerHTML = skeletons(3, 'skeleton-row');
  try {
    const { leaves } = await request(`/leave/mine${status ? `?status=${status}` : ''}`);
    list.innerHTML = leaves.length
      ? `<div class="grid grid--cards">${leaves.map((l) => `<a class="card card--link" href="/leave/${l.id}"><div class="row row--between">${badge(l.status)}<span class="muted small">${esc(l.referenceNo)}</span></div><h3>${esc(dOnly(l.startDate))} to ${esc(dOnly(l.endDate))}</h3><p class="small">${l.days} day${l.days > 1 ? 's' : ''} · ${esc(label(l.category))} · reviewer ${esc(l.reviewer.name)}</p>${l.decisionNote ? `<p class="small"><strong>Note:</strong> ${esc(l.decisionNote)}</p>` : ''}${l.status === 'INFO_REQUIRED' ? '<p class="small"><strong>Action needed:</strong> the reviewer asked for more information.</p>' : ''}</a>`).join('')}</div>`
      : emptyState(status ? 'No requests with that status' : 'No leave requests yet', 'Create a request and choose who should review it.', '<button class="button button--sm" type="button" data-new>New leave request</button>');
  } catch (e) { list.innerHTML = errorState(e.message); }
}

async function newRequest() {
  let reviewers = [];
  try { ({ reviewers } = await request('/leave/reviewers')); } catch (e) { toast(e.message, 'error'); return; }
  if (!reviewers.length) { modal({ title: 'No reviewers available', body: notice('info', 'There are no faculty members or administrators who can review leave yet. Ask an administrator to assign the Faculty role to a reviewer.') }); return; }
  let values = {};
  const m = modal({ title: 'New leave request', body: '', wide: false });
  const steps = (n) => `<ol class="steps"><li class="${n === 1 ? 'is-current' : ''}">1 Details</li><li class="${n === 2 ? 'is-current' : ''}">2 Review</li><li class="${n === 3 ? 'is-current' : ''}">3 Submitted</li></ol>`;
  const today = new Date().toISOString().slice(0, 10);
  function stepForm(serverErrors) {
    m.body.innerHTML = `${steps(1)}<form class="form" novalidate>${formError}${fields([{ name: 'reviewerId', label: 'Reviewer', type: 'select', required: true, options: reviewers.map((r) => [r.id, `${r.name}${r.department ? ` (${r.department})` : ''}`]), value: values.reviewerId }, { name: 'category', label: 'Category', type: 'select', required: true, options: CATS.map((c) => [c, label(c)]), value: values.category }])}
      ${formRow({ name: 'startDate', label: 'First day', type: 'date', required: true, value: values.startDate, min: today }, { name: 'endDate', label: 'Last day', type: 'date', required: true, value: values.endDate, min: today })}
      ${fields([{ name: 'reason', label: 'Reason', type: 'textarea', required: true, rows: 3, value: values.reason, maxlength: 1000, hint: `Up to ${rules.maxDays} days per request. Overlapping requests are not allowed.` }])}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Review request</button></div></form>`;
    const form = m.body.querySelector('form');
    form.querySelector('[data-cancel]').addEventListener('click', m.close);
    if (serverErrors) showFormError(form, Object.values(serverErrors)[0]);
    bindForm(form, {
      reviewerId: [required('Choose a reviewer.'), oneOf(reviewers.map((r) => r.id))], category: [required('Choose a category.'), oneOf(CATS)],
      startDate: [required('Choose the first day.')], endDate: [required('Choose the last day.'), (v, all) => (v && all.startDate && v < all.startDate ? 'The last day cannot be before the first day.' : null)],
      reason: [required('Explain the reason.'), minLength(10, 'Please give a little more detail (at least 10 characters).'), maxLength(1000)]
    }, (v) => { values = v; stepReview(); });
  }
  function stepReview() {
    const r = reviewers.find((x) => x.id === values.reviewerId);
    m.body.innerHTML = `${steps(2)}<div class="review-box"><dl class="kv"><dt>Reviewer</dt><dd>${esc(r.name)}</dd><dt>Category</dt><dd>${esc(label(values.category))}</dd><dt>Dates</dt><dd>${esc(dOnly(values.startDate))} to ${esc(dOnly(values.endDate))}</dd><dt>Reason</dt><dd>${esc(values.reason)}</dd></dl></div>
      <div data-error></div><div class="modal__actions"><button class="button button--secondary" type="button" data-back>Back</button><button class="button" type="button" data-send>Submit request</button></div>`;
    m.body.querySelector('[data-back]').addEventListener('click', () => stepForm());
    const send = m.body.querySelector('[data-send]');
    send.addEventListener('click', async () => {
      send.disabled = true;
      send.classList.add('is-loading');
      try {
        const { leave } = await request('/leave', { method: 'POST', body: { ...values, confirm: true } });
        m.body.innerHTML = `${steps(3)}${notice('success', 'Leave request submitted.')}<div class="review-box"><dl class="kv"><dt>Reference</dt><dd><strong>${esc(leave.referenceNo)}</strong></dd><dt>Status</dt><dd>${esc(label(leave.status))}</dd></dl></div><div class="modal__actions"><button class="button button--secondary" type="button" data-done>Close</button><a class="button" href="/leave/${leave.id}">Track request</a></div>`;
        m.body.querySelector('[data-done]').addEventListener('click', m.close);
        toast('Leave request submitted.');
        load();
      } catch (e) {
        send.disabled = false;
        send.classList.remove('is-loading');
        if (e.code === 'VALIDATION_ERROR' || e.code === 'OVERLAP') { stepForm(e.details || { x: e.message }); showFormError(m.body.querySelector('form'), e.message); return; }
        m.body.querySelector('[data-error]').innerHTML = notice('error', e.message);
      }
    });
  }
  stepForm();
}

tabs($('[data-tabs]'), [['all', 'All'], ['SUBMITTED', 'Awaiting decision'], ['INFO_REQUIRED', 'Needs information'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected'], ['WITHDRAWN', 'Withdrawn']], 'all', (t) => { status = t === 'all' ? '' : t; load(); });
on(view, 'click', { '[data-new]': newRequest, '[data-retry]': load });
(async () => { try { ({ rules } = await request('/leave/rules')); $('[data-rules]').innerHTML = disclosure(`Demonstration rules, not official policy: up to ${rules.maxDays} days per request, no overlapping requests, and leave cannot start more than ${rules.maxBackdateDays} days in the past.`); } catch { /* rules are optional context */ } })();
load();
