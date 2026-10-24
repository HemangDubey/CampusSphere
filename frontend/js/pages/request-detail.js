import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dt, dOnly, badge, skeletons, errorState, on, attempt, confirmDialog, modal, field, formError, showFormError, toast, timelineHtml, notice } from '../kit.js';
import { bindForm, required, minLength, maxLength } from '../validators.js';

const view = $('[data-view]');
const id = location.pathname.split('/').filter(Boolean)[1];
await initShell({ active: '/requests', crumbs: [['Services'], ['Service Requests', '/requests'], ['Request']], requireAuth: true });

function render({ request: r, formFields, history, isRequester }) {
  const open = ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED'].includes(r.status);
  const answers = formFields.length ? formFields : Object.keys(r.data).map((k) => ({ name: k, label: k, type: 'text' }));
  view.innerHTML = `<p><a class="auth__link" href="${isRequester ? '/requests' : '/admin/requests'}">&larr; ${isRequester ? 'My requests' : 'Request queue'}</a></p>
    <div class="page-head"><div><span class="label label--accent">Reference ${esc(r.referenceNo)}</span><h1 class="page-head__title" style="font-size:clamp(26px,4vw,48px)">${esc(r.resource.title)}</h1><p class="page-head__lead">${badge(r.status)} ${r.overdue ? badge('REJECTED', 'Overdue') : ''} Submitted ${esc(dt(r.createdAt))}</p></div></div>
    ${r.status === 'INFO_REQUIRED' && isRequester ? notice('info', 'Staff asked for more information. Add it below to continue the review.') : ''}
    <div class="split"><div class="stack-lg"><section class="card"><h2 class="section-title">Your answers</h2><dl class="kv">${answers.map((f) => `<dt>${esc(f.label)}</dt><dd>${esc(f.type === 'date' && r.data[f.name] ? dOnly(r.data[f.name]) : r.data[f.name] ?? 'Not provided')}</dd>`).join('')}</dl></section>
      ${r.decisionNote ? `<section class="card"><h2 class="section-title">Decision note</h2><p>${esc(r.decisionNote)}</p></section>` : ''}
      <section class="card"><h2 class="section-title">History</h2>${timelineHtml(history)}</section></div>
    <aside class="card"><dl class="kv"><dt>Status</dt><dd>${esc(r.status.replace('_', ' ').toLowerCase())}</dd><dt>Handler</dt><dd>${esc(r.assignee?.name || 'Not assigned yet')}</dd>${r.dueAt && open ? `<dt>Target date</dt><dd>${esc(dOnly(r.dueAt))}</dd>` : ''}</dl>
      <div class="stack">${isRequester && r.status === 'INFO_REQUIRED' ? '<button class="button" type="button" data-respond>Add requested information</button>' : ''}${isRequester && open ? '<button class="button button--secondary" type="button" data-cancel>Cancel request</button>' : ''}</div></aside></div>`;
}

function respond() {
  const m = modal({ title: 'Add information', body: `<form class="form" novalidate>${formError}${field({ name: 'message', label: 'Your response', type: 'textarea', required: true, rows: 4, maxlength: 1000 })}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Send</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { message: [required('Enter the information.'), minLength(3), maxLength(1000)] }, async (v) => {
    showFormError(form, '');
    await request(`/service-requests/${id}/respond`, { method: 'POST', body: v });
    toast('Information sent.');
    m.close();
    load();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

async function load() {
  view.innerHTML = skeletons(2);
  try { render(await request(`/service-requests/${id}`)); } catch (e) { view.innerHTML = `<p><a class="auth__link" href="/requests">&larr; My requests</a></p>${errorState(e.status === 404 ? 'That request does not exist or you do not have access to it.' : e.message, e.status !== 404)}`; }
}
on(view, 'click', {
  '[data-respond]': respond,
  '[data-cancel]': async () => {
    const reason = await confirmDialog({ title: 'Cancel this request?', message: 'Staff will no longer process it. You can submit a new request later.', confirmLabel: 'Cancel request', danger: true, requireReason: true, reasonLabel: 'Why are you cancelling?' });
    if (!reason) return;
    await attempt(() => request(`/service-requests/${id}/cancel`, { method: 'POST', body: { reason } }), { success: 'Request cancelled.' });
    load();
  },
  '[data-retry]': load
});
load();
