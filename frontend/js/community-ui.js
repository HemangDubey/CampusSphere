// Shared pieces of the community pages: topic list, post card, like/save/report actions, composer dialog.
import { request } from './api.js';
import { esc, label, ago, attempt, modal, fields, formError, showFormError, toast, badge } from './kit.js';
import { bindForm, required, minLength, maxLength } from './validators.js';

export const TOPICS = ['ACADEMICS', 'PROJECTS', 'TECHNOLOGY', 'CAMPUS_LIFE', 'CLUBS', 'CAREERS', 'GENERAL'];
export const topicOptions = TOPICS.map((t) => [t, label(t)]);
export const REASONS = [['SPAM', 'Spam or advertising'], ['HARASSMENT', 'Harassment or bullying'], ['INAPPROPRIATE', 'Inappropriate content'], ['MISINFORMATION', 'Misleading information'], ['OTHER', 'Something else']];

export const GUIDELINES = 'Be respectful, stay on topic and do not share private information about others. Posts can be reported, and moderators may hide or remove content that breaks these guidelines.';

export const signInUrl = () => `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

export function postCard(p, { detail = false } = {}) {
  const who = `${esc(p.author?.name || 'Student')}${p.author?.department ? ` · ${esc(p.author.department)}` : ''}`;
  const body = detail ? esc(p.body) : `${esc(p.body.slice(0, 280))}${p.body.length > 280 ? '…' : ''}`;
  return `<article class="card post" data-post="${p.id}">
    <div class="chips"><span class="badge badge--muted">${esc(label(p.topic))}</span>${p.club ? `<a class="badge badge--muted" href="/community/groups/${p.club.id}">${esc(p.club.name)}</a>` : ''}${p.isAnnouncement ? badge('PUBLISHED', 'Announcement') : ''}${p.status && p.status !== 'VISIBLE' ? badge('REJECTED', p.status === 'HIDDEN' ? 'Hidden by a moderator' : 'Removed') : ''}</div>
    <h3>${detail ? esc(p.title) : `<a href="/community/posts/${p.id}">${esc(p.title)}</a>`}</h3>
    <p class="muted small">${who} · ${esc(ago(p.createdAt))}</p>
    <p class="post__body">${body}</p>
    <div class="row post__actions">
      <button class="button button--ghost button--sm" type="button" data-like aria-pressed="${p.liked}">${p.liked ? '♥ Liked' : '♡ Like'} · <span data-likes>${p.likeCount}</span></button>
      ${detail ? '' : `<a class="button button--ghost button--sm" href="/community/posts/${p.id}">Comments · ${p.commentCount}</a>`}
      <button class="button button--ghost button--sm" type="button" data-save aria-pressed="${p.bookmarked}">${p.bookmarked ? 'Saved' : 'Save'}</button>
      ${p.mine ? '' : '<button class="button button--ghost button--sm" type="button" data-report-post>Report</button>'}
    </div></article>`;
}

// Click handlers for the buttons rendered by postCard. `user` may be null (signed out).
export function postActions(user, afterChange = () => {}) {
  const gate = (fn) => (btn) => { if (!user) { location.assign(signInUrl()); return undefined; } return fn(btn); };
  const id = (b) => b.closest('[data-post]').dataset.post;
  return {
    '[data-like]': gate(async (b) => {
      const want = b.getAttribute('aria-pressed') !== 'true';
      const r = await attempt(() => request(`/community/posts/${id(b)}/like`, { method: want ? 'PUT' : 'DELETE' }));
      if (r) { b.setAttribute('aria-pressed', String(r.liked)); b.innerHTML = `${r.liked ? '♥ Liked' : '♡ Like'} · <span data-likes>${r.likeCount}</span>`; afterChange(); }
    }),
    '[data-save]': gate(async (b) => {
      const want = b.getAttribute('aria-pressed') !== 'true';
      const r = await attempt(() => request(`/community/posts/${id(b)}/bookmark`, { method: want ? 'PUT' : 'DELETE' }), { success: want ? 'Saved to your posts.' : 'Removed from saved.' });
      if (r) { b.setAttribute('aria-pressed', String(r.bookmarked)); b.textContent = r.bookmarked ? 'Saved' : 'Save'; afterChange(); }
    }),
    '[data-report-post]': gate((b) => reportDialog('POST', id(b)))
  };
}

export function reportDialog(targetType, targetId) {
  const m = modal({ title: `Report this ${targetType.toLowerCase()}`, body: `<form class="form" novalidate>${formError}<p class="small muted">${esc(GUIDELINES)}</p>${fields([{ name: 'reason', label: 'Reason', type: 'select', required: true, options: REASONS }, { name: 'details', label: 'Details (optional)', type: 'textarea', rows: 3, maxlength: 500 }])}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Send report</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { reason: [required('Choose a reason.')] }, async (v) => {
    showFormError(form, '');
    await request('/community/reports', { method: 'POST', body: { targetType, targetId, reason: v.reason, details: v.details } });
    toast('Thanks. A moderator will review your report.');
    m.close();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

// Create or edit a post. `clubId` posts into a group; managers may mark it an announcement.
export function composeDialog({ post, clubId, canAnnounce = false, defaultTopic = 'GENERAL', onSaved }) {
  const announce = canAnnounce && !post ? fields([{ name: 'isAnnouncement', label: 'Send as a group announcement (notifies members)', type: 'checkbox' }]) : '';
  const m = modal({ title: post ? 'Edit post' : 'New post', body: `<form class="form" novalidate>${formError}${fields([{ name: 'title', label: 'Title', required: true, maxlength: 120, value: post?.title }, { name: 'topic', label: 'Topic', type: 'select', required: true, options: topicOptions, value: post?.topic || defaultTopic }, { name: 'body', label: 'What would you like to share?', type: 'textarea', rows: 6, required: true, maxlength: 4000, value: post?.body }])}${announce}<p class="small muted">${esc(GUIDELINES)}</p><div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">${post ? 'Save changes' : 'Publish'}</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { title: [required('Give your post a title.'), minLength(3), maxLength(120)], topic: [required('Choose a topic.')], body: [required('Write something to share.'), minLength(3), maxLength(4000)] }, async (v) => {
    showFormError(form, '');
    const body = { title: v.title, topic: v.topic, body: v.body, ...(clubId ? { clubId } : {}), ...(v.isAnnouncement ? { isAnnouncement: true } : {}) };
    const r = await request(post ? `/community/posts/${post.id}` : '/community/posts', { method: post ? 'PATCH' : 'POST', body });
    toast(post ? 'Post updated.' : 'Post published.');
    m.close();
    onSaved?.(r.post);
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}
