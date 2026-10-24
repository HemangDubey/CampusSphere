import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, ago, pageHead, skeletons, emptyState, errorState, on, tabs, qs, debounce } from '../kit.js';
import { TOPICS, postCard, postActions, composeDialog, signInUrl, GUIDELINES } from '../community-ui.js';

const view = $('[data-view]');
const user = await initShell({ active: '/community', crumbs: [['Campus Life'], ['Student Community']] });
const state = { tab: 'feed', topic: '', sort: 'recent', page: 1, posts: [] };

view.innerHTML = `${pageHead({ eyebrow: 'Campus life', title: 'Student community', lead: 'Discussions, clubs and project groups, run by students and moderated for safety.', actions: '<button class="button" type="button" data-new>New post</button> <a class="button button--secondary" href="/community/groups">Clubs &amp; groups</a>' })}
  <div class="split"><section>
    <div data-tabs></div>
    <form class="toolbar" data-filters role="search" aria-label="Search posts" novalidate>
      <div class="field field--wide"><label class="field__label" for="q">Search posts</label><input class="input" id="q" name="q" type="search" maxlength="80" placeholder="Search titles and text"></div>
      <div class="field"><label class="field__label" for="sort">Sort</label><select class="select" id="sort" name="sort"><option value="recent">Most recent</option><option value="popular">Most popular</option></select></div>
    </form>
    <div class="chips" data-topics role="group" aria-label="Topic filter"></div>
    <div class="stack-lg" data-list aria-live="polite">${skeletons(3)}</div>
    <div class="row" data-more hidden><button class="button button--secondary" type="button" data-load-more>Load more</button></div>
  </section>
  <aside class="stack-lg">
    <section class="card"><h2 class="section-title">Trending topics</h2><div data-trending>${skeletons(2, 'skeleton-row')}</div></section>
    <section class="card"><h2 class="section-title">My groups</h2><div data-groups>${skeletons(2, 'skeleton-row')}</div></section>
    <section class="card"><h2 class="section-title">Announcements</h2><div data-ann>${skeletons(2, 'skeleton-row')}</div></section>
    <section class="card"><h2 class="section-title">Community guidelines</h2><p class="small">${esc(GUIDELINES)}</p></section>
  </aside></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

function topicChips() {
  $('[data-topics]').innerHTML = [['', 'All topics'], ...TOPICS.map((t) => [t, label(t)])].map(([v, l]) => `<button class="chip chip--btn${state.topic === v ? ' is-active' : ''}" type="button" data-topic="${v}" aria-pressed="${state.topic === v}">${esc(l)}</button>`).join('');
}

async function load({ append = false } = {}) {
  if (!append) { list.innerHTML = skeletons(3); state.page = 1; }
  try {
    const q = Object.fromEntries(new FormData(filters));
    const params = { ...q, topic: state.topic, page: state.page, pageSize: 10, ...(state.tab === 'saved' ? { saved: 1 } : {}), ...(state.tab === 'mine' ? { mine: 1 } : {}) };
    const data = await request(`/community/posts?${qs(params)}`);
    state.posts = append ? [...state.posts, ...data.posts] : data.posts;
    const empty = { feed: ['No posts yet', 'Be the first to start a discussion.'], saved: ['Nothing saved yet', 'Use Save on a post to keep it here.'], mine: ['You have not posted yet', 'Share a question, project idea or tip.'] }[state.tab];
    list.innerHTML = state.posts.length ? state.posts.map((p) => postCard(p)).join('') : emptyState(empty[0], q.q || state.topic ? 'No posts match your search or topic filter.' : empty[1], user ? '<button class="button button--sm" type="button" data-new>Write a post</button>' : `<a class="button button--sm" href="${signInUrl()}">Sign in to post</a>`);
    $('[data-more]').hidden = state.posts.length >= data.total;
  } catch (e) { list.innerHTML = errorState(e.status === 401 ? 'Sign in to see this.' : e.message); }
}

async function sidebars() {
  const [trend, groups, ann] = await Promise.allSettled([request('/community/trending'), user ? request('/community/groups?mine=1&pageSize=30') : Promise.resolve(null), request('/announcements')]);
  $('[data-trending]').innerHTML = trend.status === 'fulfilled' && trend.value.topics.length
    ? `<ul class="list">${trend.value.topics.slice(0, 5).map((t) => `<li><button class="button button--ghost button--sm" type="button" data-topic="${t.topic}">${esc(label(t.topic))}</button><span class="muted small">${t.posts} post${t.posts === 1 ? '' : 's'} in the last ${trend.value.windowDays} days</span></li>`).join('')}</ul>`
    : emptyState('Nothing trending yet', 'Topics appear here once people start posting.');
  $('[data-groups]').innerHTML = !user ? `<p class="small"><a class="auth__link" href="${signInUrl()}">Sign in</a> to see your groups.</p>`
    : groups.status === 'fulfilled' && groups.value.groups.length ? `<ul class="list">${groups.value.groups.map((g) => `<li><a href="/community/groups/${g.id}"><strong>${esc(g.name)}</strong></a><span class="muted small">${g.myMembership?.status === 'PENDING' ? 'Request pending' : esc(label(g.kind))}</span></li>`).join('')}</ul>`
      : emptyState('No groups yet', 'Join a club or start a project group.', '<a class="button button--sm" href="/community/groups">Browse groups</a>');
  $('[data-ann]').innerHTML = ann.status === 'fulfilled' && ann.value.announcements.length
    ? `<ul class="list">${ann.value.announcements.map((a) => `<li><strong>${esc(a.title)}</strong><span class="muted small">${esc(a.body)}</span><span class="muted small">${esc(ago(a.publishedAt || a.createdAt))}</span></li>`).join('')}</ul>`
    : emptyState('No announcements', 'Nothing has been posted yet.');
}

const items = [['feed', 'Feed']];
if (user) items.push(['saved', 'Saved'], ['mine', 'My posts']);
tabs($('[data-tabs]'), items, 'feed', (t) => { state.tab = t; load(); });
filters.addEventListener('input', debounce(() => load(), 300));
filters.addEventListener('change', () => load());
filters.addEventListener('submit', (e) => e.preventDefault());

on(view, 'click', {
  '[data-new]': () => { if (!user) { location.assign(signInUrl()); return; } composeDialog({ defaultTopic: state.topic || 'GENERAL', onSaved: () => { state.tab = 'feed'; load(); sidebars(); } }); },
  '[data-topic]': (b) => { state.topic = b.dataset.topic; topicChips(); load(); },
  '[data-load-more]': () => { state.page += 1; load({ append: true }); },
  '[data-retry]': () => load(),
  ...postActions(user, () => { if (state.tab === 'saved') load(); })
});
topicChips();
load();
sidebars();
