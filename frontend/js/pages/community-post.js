import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, ago, skeletons, errorState, on, attempt, confirmDialog, modal, fields, formError, showFormError, toast } from '../kit.js';
import { postCard, postActions, composeDialog, reportDialog, signInUrl } from '../community-ui.js';
import { bindForm, required, maxLength } from '../validators.js';

const view = $('[data-view]');
const id = location.pathname.split('/').filter(Boolean)[2];
const user = await initShell({ active: '/community', crumbs: [['Campus Life'], ['Student Community', '/community'], ['Post']] });
let data;

function commentHtml(c, replies) {
  const own = c.mine;
  return `<li class="comment" data-comment="${c.id}"><p class="muted small"><strong>${esc(c.author?.name || 'Student')}</strong> · ${esc(ago(c.createdAt))}${c.updatedAt !== c.createdAt && new Date(c.updatedAt) - new Date(c.createdAt) > 1000 ? ' · edited' : ''}</p>
    <p>${esc(c.body)}</p>
    <div class="row"><button class="button button--ghost button--sm" type="button" data-reply>Reply</button>${own ? '<button class="button button--ghost button--sm" type="button" data-edit-comment>Edit</button><button class="button button--ghost button--sm" type="button" data-del-comment>Delete</button>' : '<button class="button button--ghost button--sm" type="button" data-report-comment>Report</button>'}</div>
    ${replies.length ? `<ul class="list comment__replies">${replies.map((r) => commentHtml(r, [])).join('')}</ul>` : ''}</li>`;
}

function render() {
  const { post, comments } = data;
  document.title = `${post.title} | CampusSphere`;
  const top = comments.filter((c) => !c.parentId);
  view.innerHTML = `<p><a class="auth__link" href="${post.club ? `/community/groups/${post.club.id}` : '/community'}">&larr; ${post.club ? esc(post.club.name) : 'Community'}</a></p>
    ${postCard(post, { detail: true })}
    ${post.mine ? '<div class="row"><button class="button button--secondary button--sm" type="button" data-edit-post>Edit post</button><button class="button button--ghost button--sm" type="button" data-del-post>Delete post</button></div>' : ''}
    <section class="card"><h2 class="section-title">Comments (${comments.length})</h2>
      ${user ? `<form class="form" data-comment-form novalidate>${formError}${fields([{ name: 'body', label: 'Add a comment', type: 'textarea', rows: 3, maxlength: 1500 }])}<button class="button" type="submit">Comment</button></form>` : `<p><a class="auth__link" href="${signInUrl()}">Sign in</a> to join the discussion.</p>`}
      ${top.length ? `<ul class="list comments">${top.map((c) => commentHtml(c, comments.filter((r) => r.parentId === c.id))).join('')}</ul>` : '<p class="muted">No comments yet.</p>'}</section>`;
  const form = $('[data-comment-form]');
  if (form) bindForm(form, { body: [required('Write a comment.'), maxLength(1500)] }, async (v) => {
    showFormError(form, '');
    await request(`/community/posts/${id}/comments`, { method: 'POST', body: { body: v.body } });
    toast('Comment added.');
    load();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

async function load() {
  try { data = await request(`/community/posts/${id}`); render(); } catch (e) { view.innerHTML = `<p><a class="auth__link" href="/community">&larr; Community</a></p>${errorState(e.status === 404 ? 'That post does not exist, was removed, or is not visible to you.' : e.message, e.status !== 404)}`; }
}

function commentDialog({ parentId, comment }) {
  const m = modal({ title: comment ? 'Edit comment' : 'Reply', body: `<form class="form" novalidate>${formError}${fields([{ name: 'body', label: comment ? 'Your comment' : 'Your reply', type: 'textarea', rows: 4, required: true, maxlength: 1500, value: comment?.body }])}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">${comment ? 'Save' : 'Reply'}</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { body: [required('Write something.'), maxLength(1500)] }, async (v) => {
    showFormError(form, '');
    if (comment) await request(`/community/comments/${comment.id}`, { method: 'PATCH', body: { body: v.body } });
    else await request(`/community/posts/${id}/comments`, { method: 'POST', body: { body: v.body, parentId } });
    toast(comment ? 'Comment updated.' : 'Reply added.');
    m.close();
    load();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}
const cid = (b) => b.closest('[data-comment]').dataset.comment;
const gate = (fn) => (b) => { if (!user) { location.assign(signInUrl()); return undefined; } return fn(b); };

on(view, 'click', {
  '[data-reply]': gate((b) => commentDialog({ parentId: cid(b) })),
  '[data-edit-comment]': (b) => commentDialog({ comment: data.comments.find((c) => c.id === cid(b)) }),
  '[data-del-comment]': async (b) => {
    if (!(await confirmDialog({ title: 'Delete this comment?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    await attempt(() => request(`/community/comments/${cid(b)}`, { method: 'DELETE' }), { success: 'Comment deleted.' });
    load();
  },
  '[data-report-comment]': gate((b) => reportDialog('COMMENT', cid(b))),
  '[data-edit-post]': () => composeDialog({ post: data.post, onSaved: load }),
  '[data-del-post]': async () => {
    if (!(await confirmDialog({ title: 'Delete this post?', message: 'The post and its comments will be permanently deleted.', confirmLabel: 'Delete post', danger: true }))) return;
    const r = await attempt(() => request(`/community/posts/${id}`, { method: 'DELETE' }), { success: 'Post deleted.' });
    if (r !== undefined) location.assign(data.post.club ? `/community/groups/${data.post.club.id}` : '/community');
  },
  '[data-retry]': load,
  ...postActions(user)
});
view.innerHTML = skeletons(2);
load();
