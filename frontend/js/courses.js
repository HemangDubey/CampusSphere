import { renderNav, renderFooter, initReveal } from './layout.js';
import { authApi, request } from './api.js';
import { esc, label, notice, emptyHtml, loadingHtml, toast } from './ui.js';
import { bindForm, required, maxLength, oneOf, consent } from './validators.js';

renderNav('/courses');
renderFooter();
initReveal();

const $ = (s) => document.querySelector(s);
const form = $('[data-form]');
let codes = [];
let years = [];

const msg = (sel, text) => {
  $('[data-form-success]').hidden = true; $('[data-form-error]').hidden = true;
  if (!sel) return;
  const b = $(sel); b.querySelector('p').textContent = text; b.hidden = false;
};

async function loadMine() {
  const box = $('[data-mine]');
  box.innerHTML = loadingHtml();
  try {
    const { registrations } = await request('/courses/registrations/mine');
    box.innerHTML = registrations.length ? `<ul class="plain-list">${registrations.map((r) => `<li><strong>${esc(r.courseCode)}</strong> ${esc(r.title || '')}<br><span class="field__hint">${esc(label(r.semester))} semester · ${esc(r.academicYear)}</span>
      <div><button class="button button--ghost button--sm" data-remove="${r.id}">Remove</button></div></li>`).join('')}</ul>` : emptyHtml('No registrations yet', 'Register for a course and it will be listed here.');
  } catch (e) {
    box.innerHTML = e.status === 401 ? emptyHtml('Sign in to see registrations', 'Registrations are private to your account.') : notice('error', e.message);
  }
}

$('[data-mine]').addEventListener('click', async (ev) => {
  const id = ev.target.closest('[data-remove]')?.dataset.remove;
  if (!id) return;
  try { await request(`/courses/registrations/${id}`, { method: 'DELETE' }); toast('Registration removed.'); } catch (e) { toast(e.message, 'error'); }
  loadMine();
});

bindForm(form, {
  courseCode: [required('Choose a course.'), (v) => (v && !codes.includes(v) ? 'Choose one of the available options.' : null)],
  academicYear: [required('Choose an academic year.'), (v) => (v && !years.includes(v) ? 'Choose one of the available options.' : null)],
  semester: [required('Choose a semester.'), oneOf(['ODD', 'EVEN', 'SUMMER'])],
  notes: [maxLength(200)],
  consent: [consent('Please confirm your details are correct.')]
}, async (values) => {
  msg(null);
  await request('/courses/registrations', { method: 'POST', body: values });
  form.reset();
  msg('[data-form-success]', 'Course registration saved.');
  loadMine();
}, { onServerError: (e) => { if (e.status === 401) location.assign('/login?next=/courses'); else msg('[data-form-error]', e.message); } });

request('/courses/catalog').then((c) => {
  codes = c.courses.map((x) => x.code);
  years = c.academicYears;
  c.courses.forEach((x) => $('#courseCode').insertAdjacentHTML('beforeend', `<option value="${esc(x.code)}">${esc(x.code)} · ${esc(x.title)} (${x.credits} credits)</option>`));
  years.forEach((y) => $('#academicYear').insertAdjacentHTML('beforeend', `<option>${esc(y)}</option>`));
}).catch((e) => msg('[data-form-error]', e.message));

authApi.me().then(loadMine).catch(() => {
  $('[data-signin]').hidden = false;
  [...form.elements].forEach((el) => { el.disabled = true; });
  loadMine();
});
