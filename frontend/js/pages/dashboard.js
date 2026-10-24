import { initShell, ROLE_LABELS } from '../shell.js';
import { request } from '../api.js';
import { $, esc, dt, ago, badge, pageHead, skeletons, emptyState, errorState, modal, fields, formRow, formError, showFormError, toast, dOnly } from '../kit.js';
import { bindForm, required, minLength, maxLength, phoneIN, intRange, pattern } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/dashboard', crumbs: [['Overview'], ['Dashboard']], requireAuth: true });

const card = (title, body, action = '') => `<section class="card"><div class="row row--between"><h2 class="section-title">${esc(title)}</h2>${action}</div>${body}</section>`;
const link = (href, text) => `<a class="auth__link small" href="${href}">${esc(text)}</a>`;
const FIELD_LABELS = { name: 'name', department: 'department', yearOfStudy: 'year of study', phone: 'phone', registrationNo: 'registration number', bio: 'short bio' };

function render(d) {
  const first = user.name.split(' ')[0];
  const c = d.counts;
  const events = d.upcomingEvents.length
    ? `<ul class="list">${d.upcomingEvents.map((e) => `<li><a href="/events/${e.id}"><strong>${esc(e.title)}</strong></a><span class="muted small">${esc(dt(e.startsAt))} · ${esc(e.venue)} · Ref ${esc(e.referenceNo)}</span></li>`).join('')}</ul>`
    : emptyState('No upcoming events yet', 'Register for an event and it will show up here.', '<a class="button button--sm" href="/events">Browse events</a>');
  const pending = [
    ...d.openRequests.map((r) => `<li><a href="/requests/${r.id}"><strong>${esc(r.resource.title)}</strong></a><span>${badge(r.status)} <span class="muted small">${esc(r.referenceNo)}</span></span></li>`),
    ...d.leaves.map((l) => `<li><a href="/leave/${l.id}"><strong>Leave ${esc(dOnly(l.startDate))}</strong></a><span>${badge(l.status)} <span class="muted small">${esc(l.referenceNo)}</span></span></li>`),
    ...d.appointments.map((a) => `<li><a href="/appointments"><strong>${esc(a.service.name)}</strong></a><span>${badge(a.status)} <span class="muted small">${a.slot ? esc(dt(a.slot.startsAt)) : 'No slot'}</span></span></li>`)
  ];
  const pendingHtml = pending.length ? `<ul class="list">${pending.join('')}</ul>` : emptyState('Nothing pending', 'Requests, leave and appointments you submit are tracked here.', '<div class="row"><a class="button button--sm button--secondary" href="/requests">Service requests</a><a class="button button--sm button--secondary" href="/leave">Request leave</a></div>');
  const notes = d.notifications.length
    ? `<ul class="list">${d.notifications.map((n) => `<li><a href="${esc(n.link || '/notifications')}"${n.readAt ? '' : ' style="font-weight:800"'}>${esc(n.title)}</a><span class="muted small">${esc(ago(n.createdAt))}${n.body ? ` · ${esc(n.body.slice(0, 70))}` : ''}</span></li>`).join('')}</ul>`
    : emptyState('No notifications yet', 'Updates about your events, requests and appointments appear here.');
  const ann = d.announcements.length ? `<ul class="list">${d.announcements.map((a) => `<li><strong>${esc(a.title)}</strong><span class="muted small">${esc(a.body.slice(0, 140))}${a.body.length > 140 ? '…' : ''}</span></li>`).join('')}</ul>` : emptyState('No announcements', 'Campus administrators can post announcements here.');
  const saved = `<div class="grid grid--2"><a class="stat card--link" href="/travel?view=saved"><span class="stat__n">${c.favorites}</span><span class="stat__l">Saved destinations</span></a><a class="stat card--link" href="/resources?view=saved"><span class="stat__n">${c.bookmarks}</span><span class="stat__l">Saved resources</span></a></div>${d.recentDestinations.length ? `<p class="small muted">Recently viewed: ${d.recentDestinations.map((r) => `<a class="auth__link" href="/travel/${esc(r.slug)}">${esc(r.name)}</a>`).join(', ')}</p>` : ''}`;
  const quick = ['Events|/events', 'Plan a trip|/trips', 'Request leave|/leave', 'Book healthcare|/healthcare', 'Ask the AI Assistant|/assistant', 'Play a game|/games'].map((q) => { const [l, h] = q.split('|'); return `<a class="button button--secondary button--sm" href="${h}">${l}</a>`; }).join('');
  const p = d.profile;
  const profile = `<div class="meter" role="progressbar" aria-valuenow="${p.completeness}" aria-valuemin="0" aria-valuemax="100" aria-label="Profile completeness"><span style="width:${p.completeness}%"></span></div><p class="small muted">${p.completeness}% complete${p.missing.length ? `. Add your ${p.missing.slice(0, 3).map((m) => FIELD_LABELS[m]).join(', ')}.` : '. Nice work.'}</p><button class="button button--secondary button--sm" type="button" data-edit-profile>Edit profile</button>`;
  const work = d.work ? card('Your workload', `<div class="grid grid--3"><a class="stat card--link" href="/approvals"><span class="stat__n">${d.work.leavesToReview}</span><span class="stat__l">Leave to review</span></a><a class="stat card--link" href="/admin/requests"><span class="stat__n">${d.work.requestsToReview}</span><span class="stat__l">Requests to review</span></a><a class="stat card--link" href="/admin/requests?overdue=true"><span class="stat__n">${d.work.overdueRequests}</span><span class="stat__l">Overdue</span></a></div>`) : '';
  view.innerHTML = `${pageHead({ eyebrow: `${ROLE_LABELS[user.role] || 'Student'} dashboard`, title: `Welcome back ${first}`, lead: 'Everything that needs your attention, in one place.' })}
    <div class="stack-lg">
      <div class="grid grid--stats"><a class="stat card--link" href="/events"><span class="stat__n">${c.registrations}</span><span class="stat__l">Upcoming events</span></a><a class="stat card--link" href="/requests"><span class="stat__n">${c.openRequests}</span><span class="stat__l">Open requests</span></a><a class="stat card--link" href="/notifications"><span class="stat__n">${c.unreadNotifications}</span><span class="stat__l">Unread notifications</span></a></div>
      ${work}
      <div class="grid grid--2">
        ${card('Upcoming events', events, link('/events', 'All events'))}
        ${card('Pending items', pendingHtml, link('/activity', 'Activity'))}
        ${card('Recent notifications', notes, link('/notifications', 'See all'))}
        ${card('Announcements', ann)}
        ${card('Saved for later', saved)}
        ${card('Your profile', profile)}
      </div>
      ${card('Quick actions', `<div class="row">${quick}</div>`)}
    </div>`;
}

function editProfile() {
  const m = modal({
    title: 'Edit profile',
    body: `<form class="form" novalidate>${formError}${fields([{ name: 'name', label: 'Full name', required: true, value: user.name, autocomplete: 'name', maxlength: 80 }])}
      ${formRow({ name: 'registrationNo', label: 'Registration number', value: user.registrationNo, maxlength: 20, hint: 'Used to pre-fill event registrations' }, { name: 'department', label: 'Department', value: user.department, maxlength: 80 })}
      ${formRow({ name: 'yearOfStudy', label: 'Year of study', type: 'number', min: 1, max: 8, value: user.yearOfStudy }, { name: 'phone', label: 'Phone', type: 'tel', value: user.phone, autocomplete: 'tel' })}
      ${fields([{ name: 'bio', label: 'About you', type: 'textarea', value: user.bio, maxlength: 300 }])}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Save profile</button></div></form>`
  });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, {
    name: [required('Enter your full name.'), minLength(2), maxLength(80)],
    registrationNo: [pattern(/^[A-Za-z0-9/-]{4,20}$/, 'Use 4 to 20 letters, numbers, dashes or slashes.')],
    department: [maxLength(80)], yearOfStudy: [intRange(1, 8, 'Year of study must be between 1 and 8.')], phone: [phoneIN()], bio: [maxLength(300)]
  }, async (values) => {
    showFormError(form, '');
    const { user: updated } = await request('/auth/me', { method: 'PATCH', body: values });
    Object.assign(user, updated);
    toast('Profile saved.');
    m.close();
    load();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

async function load() {
  view.innerHTML = `${pageHead({ title: 'Your dashboard', eyebrow: 'Overview' })}<div class="grid grid--2">${skeletons(4)}</div>`;
  try { render(await request('/dashboard')); }
  catch (e) { view.innerHTML = pageHead({ title: 'Your dashboard', eyebrow: 'Overview' }) + errorState(e.message); }
}
view.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) load(); if (e.target.closest('[data-edit-profile]')) editProfile(); });
load();
