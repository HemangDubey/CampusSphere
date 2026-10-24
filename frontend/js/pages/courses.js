import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, pageHead, skeletons, emptyState, errorState, on, field, formError, showFormError, toast, attempt, confirmDialog, disclosure } from '../kit.js';
import { bindForm, required, maxLength, oneOf, consent } from '../validators.js';

const view = $('[data-view]');
await initShell({ active: '/courses', crumbs: [['Services'], ['Student Services']], requireAuth: true });
let catalog = { courses: [], academicYears: [] };

view.innerHTML = `${pageHead({ eyebrow: 'Services', title: 'Student services', lead: 'Register for courses this term, or open another service.' })}
  <div class="grid grid--3" style="margin-bottom:20px"><a class="card card--link" href="/requests"><h3>Service requests</h3><p>Enrolment letters, IT help and more.</p></a><a class="card card--link" href="/leave"><h3>Leave requests</h3><p>Ask for time away and track the decision.</p></a><a class="card card--link" href="/library"><h3>Library</h3><p>Catalogue and your reading list.</p></a></div>
  ${disclosure('The course list is a sample catalogue for demonstration, not your institution\'s official offering.')}
  <div class="split"><form class="card form" data-form novalidate aria-labelledby="f-h"><h2 class="section-title" id="f-h">Register for a course</h2>${formError}<div data-fields></div><button class="button" type="submit">Register for course</button></form>
  <section class="card"><h2 class="section-title">My registrations</h2><div data-mine aria-live="polite">${skeletons(2, 'skeleton-row')}</div></section></div>`;
const form = $('[data-form]');
let mine = [];

async function loadMine() {
  const box = $('[data-mine]');
  try {
    ({ registrations: mine } = await request('/courses/registrations/mine'));
    box.innerHTML = mine.length ? `<ul class="list">${mine.map((r) => `<li data-id="${r.id}"><strong>${esc(r.courseCode)}</strong> ${esc(r.title || '')}<span class="muted small">${esc(label(r.semester))} semester · ${esc(r.academicYear)}</span><div><button class="button button--ghost button--sm" type="button" data-remove>Remove</button></div></li>`).join('')}</ul>` : emptyState('No registrations yet', 'Pick a course and a term and it will be listed here.');
  } catch (e) { box.innerHTML = errorState(e.message); }
}

async function init() {
  try { catalog = await request('/courses/catalog'); } catch (e) { $('[data-fields]').innerHTML = errorState(e.message, false); return; }
  $('[data-fields]').innerHTML = [
    field({ name: 'courseCode', label: 'Course', type: 'select', required: true, options: catalog.courses.map((c) => [c.code, `${c.code} · ${c.title} (${c.credits} credits)`]) }),
    field({ name: 'academicYear', label: 'Academic year', type: 'select', required: true, options: catalog.academicYears }),
    field({ name: 'semester', label: 'Semester', type: 'radio', required: true, options: [['ODD', 'Odd'], ['EVEN', 'Even'], ['SUMMER', 'Summer']] }),
    field({ name: 'notes', label: 'Notes (optional)', type: 'textarea', rows: 2, maxlength: 200 }),
    field({ name: 'consent', label: 'I confirm the details above are correct.', type: 'checkbox' })
  ].join('');
  bindForm(form, {
    courseCode: [required('Choose a course.'), oneOf(catalog.courses.map((c) => c.code))], academicYear: [required('Choose an academic year.'), oneOf(catalog.academicYears)],
    semester: [required('Choose a semester.'), oneOf(['ODD', 'EVEN', 'SUMMER'])], notes: [maxLength(200)], consent: [consent('Please confirm your details are correct.')]
  }, async (v) => {
    showFormError(form, '');
    await request('/courses/registrations', { method: 'POST', body: v });
    toast('Course registration saved.');
    form.reset();
    loadMine();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR' && e.code !== 'ALREADY_REGISTERED') showFormError(form, e.message); } });
}

on(view, 'click', {
  '[data-remove]': async (b) => {
    const r = mine.find((x) => x.id === b.closest('[data-id]').dataset.id);
    if (!(await confirmDialog({ title: 'Remove registration?', message: `Remove ${r.courseCode} for ${label(r.semester)} ${r.academicYear}?`, confirmLabel: 'Remove', danger: true }))) return;
    await attempt(() => request(`/courses/registrations/${r.id}`, { method: 'DELETE' }), { success: 'Registration removed.' });
    loadMine();
  },
  '[data-retry]': loadMine
});

init();
loadMine();
