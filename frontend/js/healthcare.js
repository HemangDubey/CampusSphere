import { renderNav, renderFooter, initReveal } from './layout.js';
import { authApi, request } from './api.js';
import { esc, label, fmtDate, notice, emptyHtml, loadingHtml, toast } from './ui.js';
import { bindForm, required, minLength, maxLength, phoneIN, oneOf, dateWithin, consent } from './validators.js';

renderNav('/healthcare');
renderFooter();
initReveal();

const $ = (s) => document.querySelector(s);
const form = $('[data-form]');
const DEPTS = [];

const panel = (title, kind, text) => `<article class="card-item"><div class="card-item__tags"><span class="chip">${esc(kind)}</span><span class="chip chip--demo">Sample</span></div><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`;

async function loadInfo() {
  try {
    const info = await request('/healthcare/info');
    $('[data-disclaimer]').textContent = info.disclaimer;
    $('[data-emergency]').textContent = info.emergency;
    $('[data-categories]').innerHTML = info.categories.map((c) => `<span class="chip">${esc(c.name)}</span>`).join('');
    $('[data-hospitals]').innerHTML = info.hospitals.map((h) => panel(h.name, h.kind, h.summary)).join('');
    $('[data-doctors]').innerHTML = info.doctors.map((d) => panel(d.name, d.speciality, d.experience)).join('');
    info.categories.forEach((c) => { DEPTS.push(c.name); $('#department').insertAdjacentHTML('beforeend', `<option>${esc(c.name)}</option>`); });
  } catch (e) {
    const box = $('[data-state-error]');
    box.querySelector('p').textContent = e.message;
    box.hidden = false;
  }
}

async function loadMine() {
  const box = $('[data-mine]');
  box.innerHTML = loadingHtml('Loading your requests…');
  try {
    const { appointments } = await request('/healthcare/appointments/mine');
    box.innerHTML = appointments.length ? `<ul class="plain-list">${appointments.map((a) => `<li class="panel">
      <div class="card-item__tags"><span class="chip ${a.status === 'REQUESTED' ? 'chip--warn' : 'chip--muted'}">${a.status === 'REQUESTED' ? 'Requested (demo)' : 'Cancelled'}</span><span class="chip chip--demo">Not sent to any provider</span></div>
      <strong>${esc(a.department)}</strong> · ${esc(fmtDate(`${a.preferredDate}T00:00:00`))} · ${esc(label(a.timePreference))}
      <p>${esc(a.reason)}</p>${a.status === 'REQUESTED' ? `<button class="button button--secondary button--sm" data-cancel="${a.id}">Cancel request</button>` : ''}</li>`).join('')}</ul>`
      : emptyHtml('No requests yet', 'Requests you send appear here with their status.');
  } catch (e) {
    box.innerHTML = e.status === 401 ? emptyHtml('Sign in to see your requests', 'Your requests are private to your account.') : notice('error', e.message);
  }
}

$('[data-mine]').addEventListener('click', async (ev) => {
  const id = ev.target.closest('[data-cancel]')?.dataset.cancel;
  if (!id) return;
  try { await request(`/healthcare/appointments/${id}`, { method: 'DELETE' }); toast('Request cancelled.'); } catch (e) { toast(e.message, 'error'); }
  loadMine();
});

const showMsg = (sel, text) => {
  $('[data-form-success]').hidden = true; $('[data-form-error]').hidden = true;
  if (!sel) return;
  const box = $(sel); box.querySelector('p').textContent = text; box.hidden = false;
};

const min = new Date(); min.setDate(min.getDate() + 1);
const max = new Date(); max.setDate(max.getDate() + 90);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
form.elements.preferredDate.min = iso(min);
form.elements.preferredDate.max = iso(max);

bindForm(form, {
  patientName: [required('Enter the patient name.'), minLength(2), maxLength(80)],
  phone: [required('Enter a contact number.'), phoneIN()],
  department: [required('Choose a department.'), (v) => (v && !DEPTS.includes(v) ? 'Choose one of the available options.' : null)],
  preferredDate: [required('Choose a preferred date.'), dateWithin(1, 90, 'Choose a date between tomorrow and 90 days from now.')],
  timePreference: [required('Choose a time preference.'), oneOf(['MORNING', 'AFTERNOON', 'EVENING'])],
  reason: [required('Briefly describe the reason for the visit.'), minLength(5), maxLength(500)],
  consent: [consent('Please confirm you understand this is a demonstration request.')]
}, async (values) => {
  showMsg(null);
  await request('/healthcare/appointments', { method: 'POST', body: values });
  form.reset();
  showMsg('[data-form-success]', 'Demonstration request recorded. No real appointment has been booked and nothing was sent to a provider.');
  toast('Request recorded (demo).');
  loadMine();
}, { onServerError: (e) => { if (e.status === 401) location.assign('/login?next=/healthcare'); else showMsg('[data-form-error]', e.message); } });

loadInfo();
authApi.me().then(loadMine).catch(() => {
  $('[data-signin]').hidden = false;
  [...form.elements].forEach((el) => { el.disabled = true; });
  loadMine();
});
