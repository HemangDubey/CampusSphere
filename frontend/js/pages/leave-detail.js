import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dOnly, dt, label, badge, skeletons, errorState, on, attempt, confirmDialog, modal, field, formError, showFormError, toast, timelineHtml, notice } from '../kit.js';
import { bindForm, required, minLength, maxLength } from '../validators.js';

const view = $('[data-view]');
const id = location.pathname.split('/').filter(Boolean)[1];
await initShell({ active: '/leave', crumbs: [['Services'], ['Leave & Approvals', '/leave'], ['Request']], requireAuth: true });

function render({ leave: l, history, isStudent }) {
  view.innerHTML = `<p><a class="auth__link" href="${isStudent ? '/leave' : '/approvals'}">&larr; ${isStudent ? 'My leave requests' : 'Approvals'}</a></p>
    <div class="page-head"><div><span class="label label--accent">Reference ${esc(l.referenceNo)}</span><h1 class="page-head__title" style="font-size:clamp(26px,4vw,48px)">${esc(dOnly(l.startDate))} to ${esc(dOnly(l.endDate))}</h1><p class="page-head__lead">${badge(l.status)} ${l.days} day${l.days > 1 ? 's' : ''} · ${esc(label(l.category))}</p></div></div>
    ${l.status === 'INFO_REQUIRED' && isStudent ? notice('info', 'Your reviewer asked for more information. Add it to continue.') : ''}
    <div class="split"><div class="stack-lg"><section class="card"><h2 class="section-title">Reason</h2><p>${esc(l.reason)}</p></section>${l.decisionNote ? `<section class="card"><h2 class="section-title">Reviewer note</h2><p>${esc(l.decisionNote)}</p></section>` : ''}<section class="card"><h2 class="section-title">Decision history</h2>${timelineHtml(history)}</section></div>
    <aside class="card"><dl class="kv"><dt>Student</dt><dd>${esc(l.student.name)}</dd><dt>Reviewer</dt><dd>${esc(l.reviewer.name)}</dd><dt>Submitted</dt><dd>${esc(dt(l.createdAt))}</dd>${l.decidedAt ? `<dt>Decided</dt><dd>${esc(dt(l.decidedAt))}</dd>` : ''}</dl>
      <div class="stack">${isStudent && l.status === 'INFO_REQUIRED' ? '<button class="button" type="button" data-respond>Add requested information</button>' : ''}${isStudent && ['SUBMITTED', 'INFO_REQUIRED'].includes(l.status) ? '<button class="button button--secondary" type="button" data-withdraw>Withdraw request</button>' : ''}</div></aside></div>`;
}

function respond() {
  const m = modal({ title: 'Add information', body: `<form class="form" novalidate>${formError}${field({ name: 'message', label: 'Your response', type: 'textarea', required: true, rows: 4, maxlength: 1000 })}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Send</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { message: [required('Enter the information.'), minLength(3), maxLength(1000)] }, async (v) => {
    showFormError(form, '');
    await request(`/leave/${id}/respond`, { method: 'POST', body: v });
    toast('Information sent.');
    m.close();
    load();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

async function load() {
  view.innerHTML = skeletons(2);
  try { render(await request(`/leave/${id}`)); } catch (e) { view.innerHTML = `<p><a class="auth__link" href="/leave">&larr; Leave requests</a></p>${errorState(e.status === 404 ? 'That leave request does not exist or you do not have access to it.' : e.message, e.status !== 404)}`; }
}
on(view, 'click', {
  '[data-respond]': respond,
  '[data-withdraw]': async () => {
    if (!(await confirmDialog({ title: 'Withdraw this request?', message: 'The reviewer will be told you withdrew it. You can submit a new request later.', confirmLabel: 'Withdraw', danger: true }))) return;
    await attempt(() => request(`/leave/${id}/withdraw`, { method: 'POST', body: {} }), { success: 'Leave request withdrawn.' });
    load();
  },
  '[data-retry]': load
});
load();
