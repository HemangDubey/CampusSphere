import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, inr, sample, cover, skeletons, errorState, on, attempt, modal, fields, formError, showFormError, toast, disclosure } from '../kit.js';
import { bindForm, required, minLength, maxLength, intRange } from '../validators.js';

const view = $('[data-view]');
const slug = location.pathname.split('/').filter(Boolean)[1];
const user = await initShell({ active: '/travel', crumbs: [['Campus Life'], ['Travel Explorer', '/travel'], ['Destination']] });
let current;

function render({ destination: d, related }) {
  current = d;
  document.title = `${d.name} | CampusSphere`;
  const ideas = Array.isArray(d.itineraryIdeas) ? d.itineraryIdeas : [];
  view.innerHTML = `<div class="hero-detail">${cover(d.imageUrl, d.name, d.type, 'cover--tall')}
    ${d.gallery?.length ? `<div class="grid grid--3">${d.gallery.map((g) => cover(g, d.name, d.type, 'cover--thumb')).join('')}</div>` : ''}
    <div class="split"><div class="stack-lg">
      <div><div class="chips"><span class="badge badge--muted">${esc(label(d.type))}</span><span class="badge badge--muted">${esc(label(d.budget))}</span>${d.isDemo ? sample : ''}</div>
        <h1 class="page-head__title" style="font-size:clamp(30px,4.5vw,58px)">${esc(d.name)}</h1><p class="small muted">${esc(d.region)}</p><p class="page-head__lead">${esc(d.description)}</p></div>
      ${disclosure('Budget ranges and durations are approximate estimates, not live quotes. There is no booking or real-time availability here.')}
      ${d.activities?.length ? `<section class="card"><h2 class="section-title">Things to do</h2><ul class="dot-list">${d.activities.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></section>` : ''}
      ${ideas.length ? `<section class="card"><h2 class="section-title">Suggested itineraries</h2>${ideas.map((i, n) => `<div class="stack"><div class="row row--between"><strong>${esc(i.title)}</strong>${user ? `<button class="button button--sm" type="button" data-use-idea="${n}">Use in a new trip</button>` : ''}</div><ul class="dot-list">${(i.items || []).map((x) => `<li>${esc(x.title)} <span class="muted">(about ${esc(inr(x.cost || 0))})</span></li>`).join('')}</ul></div>`).join('')}</section>` : ''}
      ${d.tips?.length ? `<section class="card"><h2 class="section-title">Student travel tips</h2><ul class="dot-list">${d.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
      ${related.length ? `<section><h2 class="section-title">Related destinations</h2><div class="grid grid--3">${related.map((r) => `<a class="card card--link" href="/travel/${esc(r.slug)}"><strong>${esc(r.name)}</strong><span class="muted small">${esc(r.region)}</span></a>`).join('')}</div></section>` : ''}
    </div>
    <aside class="card"><dl class="kv"><dt>Estimated budget</dt><dd>${esc(inr(d.budgetMinInr))} to ${esc(inr(d.budgetMaxInr))} per person</dd><dt>Suggested time</dt><dd>${d.recommendedDays} day${d.recommendedDays > 1 ? 's' : ''}</dd>${d.distanceKm ? `<dt>Distance</dt><dd>About ${d.distanceKm} km from Vellore (approx.)</dd>` : ''}${d.bestTime ? `<dt>Best time</dt><dd>${esc(d.bestTime)}</dd>` : ''}</dl>
      <div class="row">${user ? `<button class="button ${d.favorited ? 'button--secondary' : 'button--teal'}" type="button" data-fav aria-pressed="${d.favorited}">${d.favorited ? 'Saved ✓' : 'Save destination'}</button>` : '<a class="button button--teal" href="/login?next=' + encodeURIComponent(location.pathname) + '">Sign in to save</a>'}
        ${user ? '<button class="button" type="button" data-plan>Plan a trip here</button>' : ''}</div></aside></div></div>`;
}

function newTrip(ideaIndex) {
  const idea = ideaIndex === undefined ? null : current.itineraryIdeas[ideaIndex];
  const m = modal({
    title: 'New trip',
    body: `<form class="form" novalidate>${formError}${fields([{ name: 'title', label: 'Trip name', required: true, value: idea ? `${current.name}: ${idea.title}` : `Trip to ${current.name}`, maxlength: 80 }])}
      <div class="form-row">${fields([{ name: 'startDate', label: 'Start date', type: 'date' }, { name: 'endDate', label: 'End date', type: 'date' }])}</div>
      ${fields([{ name: 'budgetInr', label: 'Budget in rupees (optional)', type: 'number', min: 0, hint: `Typical range: ${inr(current.budgetMinInr)} to ${inr(current.budgetMaxInr)}`, value: current.budgetMaxInr }])}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Create trip</button></div></form>`
  });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { title: [required('Give your trip a name.'), minLength(3), maxLength(80)], budgetInr: [intRange(0, 10000000, 'Enter a whole number of rupees.')] }, async (v) => {
    showFormError(form, '');
    if (v.startDate && v.endDate && v.endDate < v.startDate) { showFormError(form, 'The end date cannot be before the start date.'); return; }
    const { trip } = await request('/trips', { method: 'POST', body: { ...v, destinationId: current.id } });
    if (idea?.items?.length) await request(`/trips/${trip.id}/items`, { method: 'PUT', body: { items: idea.items.map((x) => ({ title: x.title, estCostInr: x.cost || 0, dayNumber: 1, destinationId: current.id })) } });
    toast('Trip created.');
    location.assign(`/trips/${trip.id}`);
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

async function load() {
  view.innerHTML = skeletons(2);
  try { render(await request(`/destinations/${slug}`)); } catch (e) { view.innerHTML = `<p><a class="auth__link" href="/travel">&larr; All destinations</a></p>${errorState(e.status === 404 ? 'We could not find that destination.' : e.message, e.status !== 404)}`; }
}
on(view, 'click', {
  '[data-fav]': async () => { await attempt(() => request(`/destinations/${current.id}/favorite`, { method: current.favorited ? 'DELETE' : 'PUT' }), { success: current.favorited ? 'Removed from saved.' : 'Saved.' }); load(); },
  '[data-plan]': () => newTrip(),
  '[data-use-idea]': (b) => newTrip(Number(b.dataset.useIdea)),
  '[data-retry]': load
});
load();
