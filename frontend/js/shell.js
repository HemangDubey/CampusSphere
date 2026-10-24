// Application shell for signed-in pages: collapsible sidebar, top bar, notification bell.
// initShell() wraps the page's existing <main> element, so each page only supplies its own content.
//   const user = await initShell({ active: '/events', crumbs: [['Campus Life'], ['Events']], requireAuth: false });
// Menu visibility uses the permission list from /api/auth/me for convenience only: the server enforces
// every permission on every request, so hiding a link is never the security boundary.
import { authApi, request } from './api.js';
import { esc } from './ui.js';

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
  building: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4M9 11h.01M15 11h.01M9 14h.01M15 14h.01"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M20 17v4H6.5A2.5 2.5 0 0 1 4 18.5"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  leave: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
  graduation: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M21 5h-4"/>',
  gamepad: '<path d="M6 11h4M8 9v4"/><path d="M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-3.9 3.2l-1.6 7.1A3 3 0 0 0 4.1 19c1 0 1.8-.5 2.4-1.2L8 16h8l1.5 1.8c.6.7 1.4 1.2 2.4 1.2a3 3 0 0 0 2.9-3.7l-1.6-7.1A4 4 0 0 0 17.3 5z"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.3h12.4a1.5 1.5 0 0 0 1.3-2.3L14 9V3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  userCog: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4"/><circle cx="18" cy="18" r="3"/><path d="M18 14v1M18 21v1M21.5 16.5l-.9.5M15.4 19l-.9.5M21.5 19.5l-.9-.5M15.4 17l-.9-.5"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  stethoscope: '<path d="M6 3v6a4 4 0 0 0 8 0V3M4 3h4M12 3h4"/><path d="M10 13v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  chevrons: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z"/><path d="M8 2v16M16 6v16"/>'
};
export const icon = (name, size = 20) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export const ROLE_LABELS = { STUDENT: 'Student', FACULTY: 'Faculty / Staff', EVENT_ORGANIZER: 'Event Organizer', HEALTHCARE_ADMIN: 'Healthcare Administrator', CAMPUS_ADMIN: 'Campus Administrator', SUPER_ADMIN: 'Super Administrator' };

// [label, href, icon, visible(user)]
const everyone = () => true;
const signedIn = (u) => Boolean(u);
const perm = (p) => (u) => Boolean(u?.permissions?.includes(p));
const anyPerm = (u) => Boolean(u?.permissions?.length);

const SECTIONS = [
  { title: 'Overview', items: [['Dashboard', '/dashboard', 'dashboard', signedIn], ['Notifications', '/notifications', 'bell', signedIn], ['My Activity', '/activity', 'activity', signedIn]] },
  { title: 'Campus Life', items: [['Events & Symposiums', '/events', 'calendar', everyone], ['Travel Explorer', '/travel', 'compass', everyone], ['Campus Resources', '/resources', 'building', everyone], ['Library', '/library', 'book', everyone], ['Student Community', '/community', 'users', everyone]] },
  { title: 'Services', items: [['Healthcare', '/healthcare', 'heart', everyone], ['Leave & Approvals', '/leave', 'leave', signedIn], ['Service Requests', '/requests', 'inbox', signedIn], ['Student Services', '/courses', 'graduation', signedIn]] },
  { title: 'Discover', items: [['AI Assistant', '/assistant', 'sparkles', everyone], ['Games & Recreation', '/games', 'gamepad', everyone], ['Coursework Demonstrations', '/coursework', 'flask', everyone]] },
  {
    title: 'Administration', visible: anyPerm,
    items: [['Admin Dashboard', '/admin', 'shield', anyPerm], ['Event Management', '/admin/events', 'calendar', perm('event:manage')], ['Leave Approvals', '/approvals', 'leave', perm('leave:review')],
      ['Request Queue', '/admin/requests', 'inbox', perm('request:review')], ['Healthcare Management', '/admin/healthcare', 'stethoscope', perm('healthcare:manage')],
      ['Resource Management', '/admin/resources', 'folder', perm('resource:manage')], ['Content & Announcements', '/admin/content', 'map', perm('content:manage')], ['Employee Records', '/employees', 'briefcase', perm('employee:manage')],
      ['Community Moderation', '/admin/moderation', 'shield', perm('community:moderate')], ['Users & Roles', '/admin/users', 'userCog', perm('user:manage')], ['Reports & Audit Logs', '/admin/reports', 'chart', (u) => perm('report:view')(u) || perm('audit:view')(u)]]
  }
];

const store = {
  get(k) { try { return localStorage.getItem(`cs.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`cs.${k}`, v); } catch { /* storage may be unavailable */ } }
};

function isActive(href, active) {
  if (href === '/admin') return active === '/admin';
  return active === href || active.startsWith(`${href}/`);
}

function sidebarHtml(user, active) {
  const nav = SECTIONS.filter((s) => !s.visible || s.visible(user)).map((s) => {
    const items = s.items.filter((i) => i[3](user));
    if (!items.length) return '';
    return `<div class="nav-group"><p class="nav-group__title">${esc(s.title)}</p><ul>${items.map(([label, href, ic]) => {
      const on = isActive(href, active);
      return `<li><a class="nav-link${on ? ' is-active' : ''}" href="${href}" data-tip="${esc(label)}" ${on ? 'aria-current="page"' : ''}>${icon(ic)}<span class="nav-link__label">${esc(label)}</span></a></li>`;
    }).join('')}</ul></div>`;
  }).join('');
  const account = user
    ? `<div class="sidebar__user"><span class="avatar" aria-hidden="true">${esc(user.name.trim()[0]?.toUpperCase() || '?')}</span><span class="sidebar__who"><strong>${esc(user.name)}</strong><small>${esc(ROLE_LABELS[user.role] || user.role)}</small></span>
        <button class="icon-btn" type="button" data-logout data-tip="Sign out" aria-label="Sign out">${icon('logout')}</button></div>`
    : `<a class="button button--sm button--block sidebar__signin" href="/login?next=${encodeURIComponent(location.pathname)}">${icon('login', 18)}<span class="nav-link__label">Sign in</span></a>`;
  return `<div class="sidebar__head"><a class="brand" href="/" aria-label="CampusSphere home"><span class="brand__dot"></span><span class="nav-link__label">CampusSphere</span></a>
      <button class="icon-btn sidebar__collapse" type="button" data-collapse aria-label="Collapse sidebar" aria-expanded="true" data-tip="Collapse">${icon('chevrons', 18)}</button>
      <button class="icon-btn sidebar__close" type="button" data-close-drawer aria-label="Close menu">${icon('close', 18)}</button></div>
    <nav class="sidebar__nav" aria-label="Main navigation">${nav}</nav>${account}`;
}

export async function initShell({ active, crumbs = [], requireAuth = false } = {}) {
  let user = null;
  try { ({ user } = await authApi.me()); } catch (e) { if (e.status && e.status !== 401) console.warn('Could not check the session.'); }
  if (!user && requireAuth) { location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return new Promise(() => {}); }

  const main = document.querySelector('main');
  const app = document.createElement('div');
  app.className = 'app';
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.id = 'sidebar';
  sidebar.innerHTML = sidebarHtml(user, active);
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.hidden = true;
  const body = document.createElement('div');
  body.className = 'app__body';
  const top = document.createElement('header');
  top.className = 'topbar';
  const trail = crumbs.length
    ? `<nav class="crumbs" aria-label="Breadcrumb"><ol>${[['Home', '/'], ...crumbs].map(([label, href], i, all) => `<li>${href && i < all.length - 1 ? `<a href="${href}">${esc(label)}</a>` : `<span${i === all.length - 1 ? ' aria-current="page"' : ''}>${esc(label)}</span>`}</li>`).join('')}</ol></nav>`
    : '<span></span>';
  top.innerHTML = `<button class="icon-btn topbar__menu" type="button" data-open-drawer aria-label="Open menu" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button>${trail}
    <div class="topbar__actions">${user ? `<a class="icon-btn bell" href="/notifications" aria-label="Notifications" data-tip="Notifications">${icon('bell')}<span class="bell__count" data-bell hidden></span></a>` : '<a class="button button--sm" href="/login">Sign in</a>'}</div>`;

  main.parentNode.insertBefore(app, main);
  body.append(top, main);
  app.append(sidebar, backdrop, body);
  main.classList.add('app__content');
  main.id = main.id || 'main';
  const skip = document.querySelector('.skip-link');
  if (skip) skip.href = '#main';

  // ---- collapse (desktop) and drawer (mobile)
  const collapseBtn = sidebar.querySelector('[data-collapse]');
  const setCollapsed = (on) => {
    app.classList.toggle('is-collapsed', on);
    collapseBtn.setAttribute('aria-expanded', String(!on));
    collapseBtn.setAttribute('aria-label', on ? 'Expand sidebar' : 'Collapse sidebar');
    collapseBtn.dataset.tip = on ? 'Expand' : 'Collapse';
    store.set('sidebar', on ? 'collapsed' : 'open');
  };
  setCollapsed(store.get('sidebar') === 'collapsed');
  collapseBtn.addEventListener('click', () => setCollapsed(!app.classList.contains('is-collapsed')));

  const openBtn = top.querySelector('[data-open-drawer]');
  const drawer = (open) => {
    app.classList.toggle('drawer-open', open);
    backdrop.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('no-scroll', open);
    if (open) sidebar.querySelector('.nav-link.is-active, .nav-link')?.focus();
    else if (document.activeElement && sidebar.contains(document.activeElement)) openBtn.focus();
  };
  openBtn.addEventListener('click', () => drawer(true));
  sidebar.querySelector('[data-close-drawer]').addEventListener('click', () => drawer(false));
  backdrop.addEventListener('click', () => drawer(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app.classList.contains('drawer-open')) drawer(false); });
  sidebar.querySelectorAll('.nav-link').forEach((a) => a.addEventListener('click', () => drawer(false)));
  window.matchMedia('(min-width: 961px)').addEventListener('change', (m) => { if (m.matches) drawer(false); });

  sidebar.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try { await authApi.logout(); } catch { /* the session may already be gone */ }
    location.assign('/login');
  });

  // ---- unread notification count (best effort, refreshed once a minute while the tab is visible)
  if (user) {
    const bell = top.querySelector('[data-bell]');
    const refresh = async () => {
      try {
        const { unread } = await request('/notifications/unread-count');
        bell.hidden = unread === 0;
        bell.textContent = unread > 99 ? '99+' : String(unread);
        top.querySelector('.bell').setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
      } catch { /* leave the previous value */ }
    };
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    window.addEventListener('cs:notifications-changed', refresh);
  }
  return user;
}
