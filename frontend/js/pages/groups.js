import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, cover, badge, pageHead, skeletons, emptyState, errorState, pager, tabs, qs, debounce, on, modal, fields, formError, showFormError, toast } from '../kit.js';
import { topicOptions, signInUrl } from '../community-ui.js';
import { bindForm, required, minLength, maxLength, httpsUrl } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/community', crumbs: [['Campus Life'], ['Student Community', '/community'], ['Clubs & groups']] });
const state = { kind: '', page: 1, mine: false };

view.innerHTML = `${pageHead({ eyebrow: 'Student community', title: 'Clubs and groups', lead: 'Find a club or project group, ask to join, and take part in its discussion. Groups are created by students; only administrators can mark one as verified.', actions: '<button class="button" type="button" data-new>Start a group</button>' })}
  <div data-tabs></div>
  <form class="toolbar" data-filters role="search" aria-label="Search groups" novalidate>
    <div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="60" placeholder="Name or description"></div>
    <div class="field"><label class="field__label" for="category">Category</label><select class="select" id="category" name="category"><option value="">All categories</option>${topicOptions.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
  </form>
  <p class="results-note" data-count></p><div class="grid grid--cards" data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

const STATUS = { ACTIVE: 'Member', PENDING: 'Request pending' };
const card = (g) => `<article class="card card--flush card--link">${cover(g.coverUrl, g.name, g.kind === 'CLUB' ? 'CLUB' : 'SUPPORT', 'cover--thumb')}<div class="card__body">
  <div class="chips"><span class="badge badge--muted">${esc(label(g.kind))}</span><span class="badge badge--muted">${esc(label(g.category))}</span>${g.verified ? badge('PUBLISHED', 'Verified by administrators') : ''}${g.myMembership ? badge(g.myMembership.status, STATUS[g.myMembership.status]) : ''}</div>
  <h3><a href="/community/groups/${g.id}">${esc(g.name)}</a></h3><p class="small">${esc(g.description.slice(0, 160))}${g.description.length > 160 ? '…' : ''}</p>
  <p class="small muted">${g.memberCount} member${g.memberCount === 1 ? '' : 's'} · ${g.joinPolicy === 'OPEN' ? 'Open to join' : 'Join by request'}</p>
  <div class="row"><a class="button button--secondary button--sm" href="/community/groups/${g.id}">Open</a></div></div></article>`;

async function load() {
  list.innerHTML = skeletons(6);
  $('[data-pager]').innerHTML = '';
  try {
    const data = await request(`/community/groups?${qs({ ...Object.fromEntries(new FormData(filters)), kind: state.kind, page: state.page, pageSize: 12, mine: state.mine ? 1 : '' })}`);
    $('[data-count]').textContent = `${data.total} group${data.total === 1 ? '' : 's'}`;
    list.innerHTML = data.groups.length ? data.groups.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('No groups found', state.mine ? 'You have not joined any group yet.' : 'No groups match your search. Be the first to start one.', '<button class="button button--sm" type="button" data-new>Start a group</button>')}</div>`;
    pager($('[data-pager]'), { ...data, totalPages: Math.ceil(data.total / data.pageSize) }, (p) => { state.page = p; load(); });
  } catch (e) { list.innerHTML = `<div style="grid-column:1/-1">${errorState(e.message)}</div>`; }
}

function newGroup() {
  if (!user) { location.assign(signInUrl()); return; }
  const m = modal({ title: 'Start a group', body: `<form class="form" novalidate>${formError}${fields([{ name: 'name', label: 'Name', required: true, maxlength: 80 }, { name: 'kind', label: 'Type', type: 'select', required: true, options: [['CLUB', 'Club or society (public discussion)'], ['PROJECT_GROUP', 'Project group (members-only discussion)']], value: 'CLUB' }, { name: 'category', label: 'Category', type: 'select', required: true, options: topicOptions, value: 'GENERAL' }, { name: 'description', label: 'Description', type: 'textarea', rows: 4, required: true, maxlength: 1500 }, { name: 'joinPolicy', label: 'How people join', type: 'select', required: true, options: [['REQUEST', 'Managers approve requests'], ['OPEN', 'Anyone can join']], value: 'REQUEST' }, { name: 'contactLink', label: 'Official link (optional)', type: 'url', hint: 'A full https:// link, for example your club page.' }])}<p class="small muted">New groups are not marked as official or verified until an administrator reviews them.</p><div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Create group</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { name: [required('Enter a name.'), minLength(3), maxLength(80)], description: [required('Describe the group.'), minLength(10, 'Use at least 10 characters.'), maxLength(1500)], contactLink: [httpsUrl()] }, async (v) => {
    showFormError(form, '');
    const { group } = await request('/community/groups', { method: 'POST', body: v });
    toast('Group created.');
    location.assign(`/community/groups/${group.id}`);
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

const items = [['', 'All'], ['CLUB', 'Clubs'], ['PROJECT_GROUP', 'Project groups']];
if (user) items.push(['mine', 'My groups']);
tabs($('[data-tabs]'), items, '', (t) => { state.mine = t === 'mine'; state.kind = t === 'mine' ? '' : t; state.page = 1; load(); });
const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('submit', (e) => e.preventDefault());
on(view, 'click', { '[data-new]': newGroup, '[data-retry]': load });
load();
