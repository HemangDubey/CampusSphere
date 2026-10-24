import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, cover, badge, skeletons, emptyState, errorState, on, attempt, confirmDialog, modal, fields, formError, showFormError, toast, ago, notice } from '../kit.js';
import { topicOptions, postCard, postActions, composeDialog, signInUrl } from '../community-ui.js';
import { bindForm, required, minLength, maxLength, httpsUrl } from '../validators.js';

const view = $('[data-view]');
const id = location.pathname.split('/').filter(Boolean)[2];
const user = await initShell({ active: '/community', crumbs: [['Campus Life'], ['Student Community', '/community'], ['Clubs & groups', '/community/groups'], ['Group']] });
let g;
let requests = [];

const isMember = () => g.myMembership?.status === 'ACTIVE';
const isManager = () => isMember() && g.myMembership.role === 'MANAGER';

function actionButton() {
  if (!user) return `<a class="button" href="${signInUrl()}">Sign in to join</a>`;
  if (g.status !== 'PUBLISHED') return '';
  if (!g.myMembership) return `<button class="button" type="button" data-join>${g.joinPolicy === 'OPEN' ? 'Join group' : 'Request to join'}</button>`;
  if (g.myMembership.status === 'PENDING') return '<button class="button button--secondary" type="button" data-leave>Withdraw request</button>';
  return '<button class="button button--secondary" type="button" data-leave>Leave group</button>';
}

async function render() {
  document.title = `${g.name} | CampusSphere`;
  const manage = g.canManage;
  view.innerHTML = `<p><a class="auth__link" href="/community/groups">&larr; Clubs &amp; groups</a></p>
    <div class="hero-detail">${cover(g.coverUrl, g.name, g.kind === 'CLUB' ? 'CLUB' : 'SUPPORT', 'cover--tall')}
    <div class="split"><div class="stack-lg">
      <div><div class="chips"><span class="badge badge--muted">${esc(label(g.kind))}</span><span class="badge badge--muted">${esc(label(g.category))}</span>${g.verified ? badge('PUBLISHED', 'Verified by administrators') : '<span class="badge badge--muted">Not verified</span>'}${g.status === 'ARCHIVED' ? badge('CANCELLED', 'Archived') : ''}${g.myMembership ? badge(g.myMembership.status, g.myMembership.status === 'ACTIVE' ? (isManager() ? 'Manager' : 'Member') : 'Request pending') : ''}</div>
      <h1 class="page-head__title" style="font-size:clamp(28px,4vw,52px)">${esc(g.name)}</h1><p class="page-head__lead">${esc(g.description)}</p></div>
      <div class="row">${actionButton()}${manage && g.status === 'PUBLISHED' ? '<button class="button button--secondary" type="button" data-edit>Edit group</button><button class="button button--ghost" type="button" data-archive>Archive</button>' : ''}</div>
      <section><div class="row"><h2 class="section-title">Discussion</h2>${isMember() && g.status === 'PUBLISHED' ? '<button class="button button--sm" type="button" data-new>New post</button>' : ''}</div>
        <div class="stack-lg" data-posts>${g.canReadDiscussion ? skeletons(2) : notice('info', g.kind === 'PROJECT_GROUP' ? 'The discussion of a project group is visible to members only.' : 'Sign in to read the discussion.')}</div></section>
    </div>
    <aside class="stack-lg">
      <section class="card"><h2 class="section-title">About</h2><dl class="kv"><dt>Members</dt><dd>${g.memberCount}</dd><dt>Joining</dt><dd>${g.joinPolicy === 'OPEN' ? 'Open to everyone' : 'Managers approve requests'}</dd><dt>Managers</dt><dd>${g.managers.map((m) => esc(m.name)).join(', ') || 'None'}</dd>${g.contactLink ? `<dt>Link</dt><dd><a href="${esc(g.contactLink)}" target="_blank" rel="noopener noreferrer">${esc(g.contactLink)}</a></dd>` : ''}</dl>${g.verified ? '' : '<p class="small muted">This group has been created by students and has not been verified as an official university club.</p>'}</section>
      ${manage ? '<section class="card"><h2 class="section-title">Join requests</h2><div data-requests></div></section>' : ''}
      ${g.members ? `<section class="card"><h2 class="section-title">Members</h2><ul class="list" data-members>${g.members.map((m) => `<li data-uid="${m.userId}"><strong>${esc(m.name)}</strong><span class="muted small">${m.role === 'MANAGER' ? 'Manager' : 'Member'}${m.department ? ` · ${esc(m.department)}` : ''}</span>${manage && m.userId !== user.id ? `<span class="row"><button class="button button--ghost button--sm" type="button" data-role="${m.role === 'MANAGER' ? 'MEMBER' : 'MANAGER'}">${m.role === 'MANAGER' ? 'Make member' : 'Make manager'}</button><button class="button button--ghost button--sm" type="button" data-remove>Remove</button></span>` : ''}</li>`).join('')}</ul></section>` : ''}
    </aside></div></div>`;
  if (g.canReadDiscussion) loadPosts();
  if (manage) loadRequests();
}

async function loadPosts() {
  const box = $('[data-posts]');
  try {
    const { posts } = await request(`/community/posts?clubId=${id}&pageSize=30`);
    box.innerHTML = posts.length ? posts.map((p) => postCard(p)).join('') : emptyState('No posts yet', isMember() ? 'Start the conversation.' : 'Join the group to post.');
  } catch (e) { box.innerHTML = errorState(e.message); }
}

async function loadRequests() {
  const box = $('[data-requests]');
  if (!box) return;
  try {
    ({ requests } = await request(`/community/groups/${id}/requests`));
    box.innerHTML = requests.length ? `<ul class="list">${requests.map((r) => `<li data-uid="${r.userId}"><strong>${esc(r.name)}</strong><span class="muted small">${esc(r.message || 'No message')} · ${esc(ago(r.createdAt))}</span><span class="row"><button class="button button--sm" type="button" data-decide="approve">Approve</button><button class="button button--secondary button--sm" type="button" data-decide="reject">Decline</button></span></li>`).join('')}</ul>` : '<p class="muted small">No pending requests.</p>';
  } catch (e) { box.innerHTML = errorState(e.message); }
}

async function load() {
  try { ({ group: g } = await request(`/community/groups/${id}`)); await render(); } catch (e) { view.innerHTML = `<p><a class="auth__link" href="/community/groups">&larr; Groups</a></p>${errorState(e.status === 404 ? 'That group does not exist or is not available.' : e.message, e.status !== 404)}`; }
}

function editDialog() {
  const m = modal({ title: 'Edit group', body: `<form class="form" novalidate>${formError}${fields([{ name: 'name', label: 'Name', required: true, maxlength: 80, value: g.name }, { name: 'category', label: 'Category', type: 'select', options: topicOptions, value: g.category }, { name: 'description', label: 'Description', type: 'textarea', rows: 4, required: true, maxlength: 1500, value: g.description }, { name: 'joinPolicy', label: 'How people join', type: 'select', options: [['REQUEST', 'Managers approve requests'], ['OPEN', 'Anyone can join']], value: g.joinPolicy }, { name: 'contactLink', label: 'Official link (optional)', type: 'url', value: g.contactLink }])}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Save changes</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { name: [required('Enter a name.'), minLength(3), maxLength(80)], description: [required('Describe the group.'), minLength(10, 'Use at least 10 characters.'), maxLength(1500)], contactLink: [httpsUrl()] }, async (v) => {
    showFormError(form, '');
    await request(`/community/groups/${id}`, { method: 'PATCH', body: v });
    toast('Group updated.');
    m.close();
    load();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

function joinDialog() {
  const m = modal({ title: `Request to join ${g.name}`, body: `<form class="form" novalidate>${formError}${fields([{ name: 'message', label: 'Message to the managers (optional)', type: 'textarea', rows: 3, maxlength: 300 }])}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Send request</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, {}, async (v) => {
    showFormError(form, '');
    const r = await request(`/community/groups/${id}/join`, { method: 'POST', body: { message: v.message } });
    toast(r.status === 'ACTIVE' ? 'You joined the group.' : 'Request sent.');
    m.close();
    load();
  }, { onServerError: (e) => showFormError(form, e.message) });
}

const uid = (b) => b.closest('[data-uid]').dataset.uid;
on(view, 'click', {
  '[data-join]': async () => {
    if (g.joinPolicy === 'OPEN') { await attempt(() => request(`/community/groups/${id}/join`, { method: 'POST', body: {} }), { success: 'You joined the group.' }); load(); } else joinDialog();
  },
  '[data-leave]': async () => {
    const pending = g.myMembership.status === 'PENDING';
    if (!(await confirmDialog({ title: pending ? 'Withdraw your request?' : `Leave ${g.name}?`, message: pending ? 'The managers will no longer see your request.' : 'You will lose access to members-only content.', confirmLabel: pending ? 'Withdraw' : 'Leave group', danger: true }))) return;
    await attempt(() => request(`/community/groups/${id}/join`, { method: 'DELETE' }), { success: pending ? 'Request withdrawn.' : 'You left the group.' });
    load();
  },
  '[data-new]': () => composeDialog({ clubId: id, canAnnounce: isManager(), defaultTopic: g.category, onSaved: loadPosts }),
  '[data-edit]': editDialog,
  '[data-archive]': async () => {
    if (!(await confirmDialog({ title: 'Archive this group?', message: 'It will disappear from the directory and stop accepting posts and members.', confirmLabel: 'Archive group', danger: true }))) return;
    await attempt(() => request(`/community/groups/${id}/archive`, { method: 'POST' }), { success: 'Group archived.' });
    load();
  },
  '[data-decide]': async (b) => { await attempt(() => request(`/community/groups/${id}/requests/${uid(b)}`, { method: 'POST', body: { decision: b.dataset.decide } }), { success: b.dataset.decide === 'approve' ? 'Member approved.' : 'Request declined.' }); load(); },
  '[data-role]': async (b) => { await attempt(() => request(`/community/groups/${id}/members/${uid(b)}/role`, { method: 'PUT', body: { role: b.dataset.role } }), { success: 'Role updated.' }); load(); },
  '[data-remove]': async (b) => {
    if (!(await confirmDialog({ title: 'Remove this member?', message: 'They will lose access to the group and be notified.', confirmLabel: 'Remove', danger: true }))) return;
    await attempt(() => request(`/community/groups/${id}/members/${uid(b)}`, { method: 'DELETE' }), { success: 'Member removed.' });
    load();
  },
  '[data-retry]': load,
  ...postActions(user)
});
view.innerHTML = skeletons(2);
load();
