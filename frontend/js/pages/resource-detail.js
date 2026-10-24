import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, badge, cover, skeletons, errorState, on, attempt, modal, field, formError, showFormError, toast, notice } from '../kit.js';
import { openRequestForm } from '../request-form.js';
import { bindForm, required, minLength, maxLength } from '../validators.js';

const view = $('[data-view]');
const id = location.pathname.split('/').filter(Boolean)[1];
const user = await initShell({ active: '/resources', crumbs: [['Campus Life'], ['Campus Resources', '/resources'], ['Resource']] });
let current;

const AVAIL = { AVAILABLE: 'Available', LIMITED: 'Limited availability', UNAVAILABLE: 'Currently unavailable' };
const READING = { WANT_TO_READ: 'Want to read', READING: 'Reading', DONE: 'Finished' };

function render({ resource: r, related }) {
  current = r;
  document.title = `${r.title} | CampusSphere`;
  const library = r.kind === 'LIBRARY';
  const canRequest = r.acceptsRequests && r.status !== 'UNAVAILABLE';
  view.innerHTML = `<div class="hero-detail">${cover(r.imageUrl, r.title, r.kind, 'cover--tall')}
    <div class="split"><div class="stack-lg"><div><div class="chips"><span class="badge badge--muted">${esc(label(r.kind))}</span>${r.category ? `<span class="badge badge--muted">${esc(r.category.name)}</span>` : ''}${badge(r.status, AVAIL[r.status])}</div>
      <h1 class="page-head__title" style="font-size:clamp(28px,4vw,52px)">${esc(r.title)}</h1>${r.author ? `<p class="muted">by ${esc(r.author)}</p>` : ''}<p class="page-head__lead">${esc(r.summary)}</p></div>
      ${r.details ? `<section class="card"><h2 class="section-title">About</h2><p>${esc(r.details)}</p></section>` : ''}
      ${r.accessUrl ? `<section class="card"><h2 class="section-title">Access</h2><p><a class="button" href="${esc(r.accessUrl)}" target="_blank" rel="noopener noreferrer">Open the official link</a></p><p class="small muted">Opens an external website. CampusSphere does not host or check its content.</p></section>` : ''}
      ${r.publisher || r.publishedYear || r.tags?.length ? `<section class="card"><h2 class="section-title">Publication</h2><dl class="kv">${r.publisher ? `<dt>Publisher</dt><dd>${esc(r.publisher)}</dd>` : ''}${r.publishedYear ? `<dt>Year</dt><dd>${esc(r.publishedYear)}</dd>` : ''}</dl>${r.tags?.length ? `<div class="chips">${r.tags.map((t) => `<a class="badge badge--muted" href="/${library ? 'library' : 'resources'}?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}</section>` : ''}
      ${r.eligibility || r.instructions || r.requiredDocuments?.length ? `<section class="card"><h2 class="section-title">How it works</h2>${r.eligibility ? `<p><strong>Eligibility:</strong> ${esc(r.eligibility)}</p>` : ''}${r.instructions ? `<p><strong>Instructions:</strong> ${esc(r.instructions)}</p>` : ''}${r.requiredDocuments?.length ? `<p><strong>Required documents:</strong></p><ul class="dot-list">${r.requiredDocuments.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}</section>` : ''}
      ${r.contactInfo ? `<section class="card"><h2 class="section-title">Contact</h2><p>${esc(r.contactInfo)}</p></section>` : notice('info', 'No verified contact details have been added for this resource yet.')}
      ${related.length ? `<section><h2 class="section-title">Related</h2><div class="grid grid--3">${related.map((x) => `<a class="card card--link" href="/resources/${x.id}"><strong>${esc(x.title)}</strong><span class="muted small">${esc(x.summary.slice(0, 80))}</span></a>`).join('')}</div></section>` : ''}</div>
    <aside class="card"><div class="stack">
      ${canRequest ? '<button class="button button--lg" type="button" data-request>Make a request</button>' : r.acceptsRequests ? notice('error', 'Requests are paused because this resource is unavailable.') : ''}
      ${user ? `<button class="button button--secondary" type="button" data-bm aria-pressed="${r.bookmarked}">${r.bookmarked ? 'Saved ✓' : 'Save resource'}</button>` : `<a class="button button--secondary" href="/login?next=${encodeURIComponent(location.pathname)}">Sign in to save or request</a>`}
      ${library && user ? `<label class="field__label" for="reading">Reading list</label><select class="select" id="reading" data-reading><option value="">Not on my list</option>${Object.entries(READING).map(([v, l]) => `<option value="${v}" ${r.readingStatus === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
      ${library ? '<p class="small muted">Borrowing and reservations are not available in this version of CampusSphere.</p>' : ''}
      ${user ? '<button class="button button--ghost button--sm" type="button" data-report>Report an issue</button>' : ''}</div></aside></div></div>`;
  if (new URLSearchParams(location.search).get('request') === '1' && canRequest && user) { history.replaceState(null, '', location.pathname); openRequestForm(r, user, load); }
}

function reportDialog() {
  const m = modal({ title: 'Report an issue', body: `<form class="form" novalidate>${formError}${field({ name: 'message', label: 'What is wrong with this listing?', type: 'textarea', required: true, rows: 4, maxlength: 500 })}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Send report</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { message: [required('Describe the issue.'), minLength(10, 'Please describe the issue (at least 10 characters).'), maxLength(500)] }, async (v) => {
    showFormError(form, '');
    await request(`/resources/${id}/report`, { method: 'POST', body: v });
    toast('Thanks, your report was sent to the administrators.');
    m.close();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

async function load() {
  view.innerHTML = skeletons(2);
  try { render(await request(`/resources/${id}`)); } catch (e) { view.innerHTML = `<p><a class="auth__link" href="/resources">&larr; All resources</a></p>${errorState(e.status === 404 ? 'We could not find that resource.' : e.message, e.status !== 404)}`; }
}
on(view, 'click', {
  '[data-request]': () => openRequestForm(current, user, load),
  '[data-bm]': async () => { await attempt(() => request(`/resources/${id}/bookmark`, { method: current.bookmarked ? 'DELETE' : 'PUT' }), { success: current.bookmarked ? 'Removed from saved.' : 'Saved.' }); load(); },
  '[data-report]': reportDialog,
  '[data-retry]': load
});
view.addEventListener('change', async (e) => {
  if (!e.target.matches('[data-reading]')) return;
  const v = e.target.value;
  await attempt(() => (v ? request(`/reading-list/${id}`, { method: 'PUT', body: { status: v } }) : request(`/reading-list/${id}`, { method: 'DELETE' })), { success: v ? 'Reading list updated.' : 'Removed from your reading list.' });
  load();
});
load();
