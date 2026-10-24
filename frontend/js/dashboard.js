// Protected dashboard: the server decides who is signed in. A 401 sends the visitor to /login.
import { renderNav, renderFooter, initReveal } from './layout.js';
import { enhanceForm } from './forms.js';
import { authApi, request } from './api.js';
import { esc, fmtDate, fmtTime, notice, emptyHtml, loadingHtml } from './ui.js';

renderNav('/dashboard');
renderFooter();
initReveal();

const $ = (s) => document.querySelector(s);
const states = { loading: $('[data-state=loading]'), error: $('[data-state=error]'), ready: $('[data-state=ready]') };
const show = (name) => Object.entries(states).forEach(([k, el]) => { el.hidden = k !== name; });

function fill(user) {
  $('[data-welcome]').innerHTML = `Welcome,<br><em></em>`;
  $('[data-welcome] em').textContent = user.name.split(' ')[0];
  $('[data-email]').textContent = `${user.email} · ${user.role.toLowerCase()}`;
  const form = $('[data-profile-form]');
  ['name', 'department', 'yearOfStudy', 'phone', 'bio'].forEach((f) => { form.elements[f].value = user[f] ?? ''; });
}

function note(sel, message) {
  $('[data-profile-success]').hidden = true;
  $('[data-profile-error]').hidden = true;
  if (!sel) return;
  const box = $(sel);
  box.querySelector('p').textContent = message;
  box.hidden = false;
}

async function loadUpcoming() {
  const box = $('[data-upcoming]');
  box.innerHTML = loadingHtml('Loading your events…');
  try {
    const { events } = await request('/events/mine');
    const upcoming = events.filter((e) => !e.isPast);
    box.innerHTML = upcoming.length
      ? `<ul class="dash__events">${upcoming.map((e) => `<li><a href="/events"><strong>${esc(e.title)}</strong><span>${esc(fmtDate(e.startsAt))} · ${esc(fmtTime(e.startsAt))} · ${esc(e.venue)}</span></a>${e.isDemo ? ' <span class="chip">Demo event</span>' : ''}</li>`).join('')}</ul>`
      : emptyHtml('No registrations yet', 'Register for an event and it will appear here.');
  } catch (e) {
    box.innerHTML = notice('error', e.message);
  }
}

async function init() {
  try {
    const { user } = await authApi.me();
    fill(user);
    show('ready');
    if (user.role === 'ADMIN') document.querySelector('[data-admin-link]').hidden = false;
    loadUpcoming();
  } catch (e) {
    if (e.status === 401) { location.replace('/login?next=/dashboard'); return; }
    $('[data-error-text]').textContent = e.message;
    show('error');
  }
}

enhanceForm($('[data-profile-form]'), {
  onSubmit: async (data) => {
    note(null);
    try {
      const { user } = await request('/auth/me', { method: 'PATCH', body: data });
      fill(user);
      note('[data-profile-success]', 'Profile saved.');
    } catch (e) {
      if (e.status === 401) { location.replace('/login?next=/dashboard'); return; }
      const first = e.details && Object.values(e.details)[0];
      note('[data-profile-error]', first || e.message);
    }
  }
});

$('[data-logout]').addEventListener('click', async () => {
  try { await authApi.logout(); } catch { /* session may already be gone */ }
  location.assign('/login');
});

init();
