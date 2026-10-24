import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, ago, badge, pageHead, skeletons, emptyState, errorState, tabs, on, attempt, modal, fields, formError, showFormError, toast, pager } from '../kit.js';
import { bindForm } from '../validators.js';

const view = $('[data-view]');
await initShell({ active: '/admin/moderation', crumbs: [['Administration', '/admin'], ['Community moderation']], requireAuth: true });
const state = { status: 'OPEN', page: 1, reports: [] };

view.innerHTML = `${pageHead({ eyebrow: 'Administration', title: 'Community moderation', lead: 'Review reported posts and comments. Every action is recorded in the audit log and the author is notified.' })}<div data-tabs></div><div class="stack-lg" data-list>${skeletons(3)}</div><div class="pager" data-pager></div>`;
const list = $('[data-list]');

const targetHtml = (r) => {
  const t = r.target;
  if (!t) return '<p class="muted">The reported content no longer exists.</p>';
  return `<blockquote class="quote">${r.targetType === 'POST' ? `<strong>${esc(t.title)}</strong><br>` : ''}${esc(t.body.slice(0, 400))}<footer class="small muted">by ${esc(t.author?.name || 'Unknown')} · currently ${esc(t.status.toLowerCase())}${r.targetType === 'COMMENT' ? ` · <a href="/community/posts/${t.postId}">open post</a>` : ` · <a href="/community/posts/${t.id}">open post</a>`}</footer></blockquote>`;
};

async function load() {
  list.innerHTML = skeletons(3);
  try {
    const data = await request(`/manage/community/reports?status=${state.status}&page=${state.page}`);
    state.reports = data.reports;
    list.innerHTML = data.reports.length ? data.reports.map((r) => `<article class="card" data-id="${r.id}"><div class="chips"><span class="badge badge--muted">${esc(r.targetType.toLowerCase())}</span><span class="badge badge--muted">${esc(label(r.reason))}</span>${badge(r.status === 'OPEN' ? 'SUBMITTED' : r.status === 'ACTIONED' ? 'APPROVED' : 'CANCELLED', label(r.status))}</div>
      <p class="small muted">Reported by ${esc(r.reporter.name)} · ${esc(ago(r.createdAt))}${r.details ? ` · “${esc(r.details)}”` : ''}</p>${targetHtml(r)}
      ${r.status === 'OPEN' ? '<div class="row"><button class="button button--sm" type="button" data-act="HIDE">Hide</button><button class="button button--secondary button--sm" type="button" data-act="REMOVE">Remove</button><button class="button button--ghost button--sm" type="button" data-act="DISMISS">Dismiss</button></div>' : `<p class="small muted">${esc(r.resolver?.name || 'A moderator')} ${r.status === 'ACTIONED' ? 'acted on this' : 'dismissed this'}${r.resolutionNote ? `: ${esc(r.resolutionNote)}` : ''}</p>${r.status === 'ACTIONED' && r.target?.status === 'HIDDEN' ? `<button class="button button--secondary button--sm" type="button" data-restore="${r.targetType === 'POST' ? 'post' : 'comment'}" data-target="${r.targetId}">Restore</button>` : ''}`}</article>`).join('') : emptyState(state.status === 'OPEN' ? 'No open reports' : 'Nothing here', state.status === 'OPEN' ? 'Reported content will appear here for review.' : 'No reports with this status.');
    pager($('[data-pager]'), { ...data, totalPages: Math.ceil(data.total / data.pageSize) }, (p) => { state.page = p; load(); });
  } catch (e) { list.innerHTML = errorState(e.message); }
}

function act(report, action) {
  const needsNote = action !== 'DISMISS';
  const m = modal({ title: { HIDE: 'Hide content', REMOVE: 'Remove content', DISMISS: 'Dismiss report' }[action], body: `<form class="form" novalidate>${formError}<p>${action === 'HIDE' ? 'Hidden content can be restored later.' : action === 'REMOVE' ? 'Removed content cannot be restored.' : 'The content stays visible.'}</p>${fields([{ name: 'note', label: needsNote ? 'Note to the author (required)' : 'Note (optional)', type: 'textarea', rows: 3, maxlength: 500 }])}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button ${action === 'REMOVE' ? 'button--danger' : ''}" type="submit">Confirm</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { note: needsNote ? [(v) => (String(v || '').trim().length >= 3 ? null : 'Add a short note (at least 3 characters).')] : [] }, async (v) => {
    showFormError(form, '');
    await request(`/manage/community/reports/${report.id}/resolve`, { method: 'POST', body: { action, note: v.note } });
    toast('Done.');
    m.close();
    load();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

tabs($('[data-tabs]'), [['OPEN', 'Open'], ['ACTIONED', 'Actioned'], ['DISMISSED', 'Dismissed']], 'OPEN', (t) => { state.status = t; state.page = 1; load(); });
on(view, 'click', {
  '[data-act]': (b) => act(state.reports.find((r) => r.id === b.closest('[data-id]').dataset.id), b.dataset.act),
  '[data-restore]': async (b) => { await attempt(() => request(`/manage/community/restore/${b.dataset.restore}/${b.dataset.target}`, { method: 'POST' }), { success: 'Content restored.' }); load(); },
  '[data-retry]': load
});
load();
