// Event registration wizard: 1) details  2) review  3) confirmation from the saved server record.
// Nothing is reported as registered until the server has created the registration.
import { request } from './api.js';
import { esc, modal, fields, formRow, formError, showFormError, notice, dt, inr, toast } from './kit.js';
import { bindForm, required, minLength, maxLength, email, intRange, oneOf, consent, pattern } from './validators.js';

const TRACKS = ['Paper presentation', 'Project expo', 'Quiz'];

export function openRegistration(event, user, onDone) {
  if (!user) { location.assign(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
  const symposium = event.category === 'SYMPOSIUM';
  let values = { fullName: user.name, registrationNo: user.registrationNo || '', email: user.email, department: user.department || '', yearOfStudy: user.yearOfStudy || '' };
  const m = modal({ title: `Register: ${event.title}`, body: '', wide: false });
  const steps = (n) => `<ol class="steps"><li class="${n === 1 ? 'is-current' : ''}">1 Details</li><li class="${n === 2 ? 'is-current' : ''}">2 Review</li><li class="${n === 3 ? 'is-current' : ''}">3 Confirmation</li></ol>`;

  function stepDetails(serverMessage) {
    m.body.innerHTML = `${steps(1)}<p class="muted small">${esc(dt(event.startsAt))} · ${esc(event.venue)}${event.spotsLeft != null ? ` · ${event.spotsLeft} seat${event.spotsLeft === 1 ? '' : 's'} left` : ''}</p>
      ${event.eligibility ? `<p class="small"><strong>Eligibility:</strong> ${esc(event.eligibility)}</p>` : ''}
      <form class="form" novalidate>${formError}
        ${fields([{ name: 'fullName', label: 'Full name', required: true, value: values.fullName, autocomplete: 'name', maxlength: 80 }])}
        ${formRow({ name: 'registrationNo', label: 'University registration number', required: true, value: values.registrationNo, maxlength: 20, hint: 'For example 21BCE0001' }, { name: 'email', label: 'Email', type: 'email', required: true, value: values.email, autocomplete: 'email' })}
        ${formRow({ name: 'department', label: 'Department', required: true, value: values.department, maxlength: 80 }, { name: 'yearOfStudy', label: 'Year of study', type: 'number', required: true, min: 1, max: 8, value: values.yearOfStudy })}
        ${symposium ? formRow({ name: 'teamSize', label: 'Team size (1 to 4)', type: 'number', required: true, min: 1, max: 4, value: values.teamSize }, { name: 'track', label: 'Track', type: 'select', required: true, options: TRACKS, value: values.track }) : ''}
        ${event.instructions ? `<p class="small muted"><strong>Participation instructions:</strong> ${esc(event.instructions)}</p>` : ''}
        ${fields([{ name: 'consent', label: 'I confirm the details above are correct.', type: 'checkbox', value: values.consent }])}
        <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Review registration</button></div>
      </form>`;
    const form = m.body.querySelector('form');
    if (serverMessage) showFormError(form, serverMessage);
    form.querySelector('[data-cancel]').addEventListener('click', m.close);
    const schema = {
      fullName: [required('Enter your full name.'), minLength(2), maxLength(80)],
      registrationNo: [required('Enter your university registration number.'), pattern(/^[A-Za-z0-9/-]{4,20}$/, 'Use 4 to 20 letters, numbers, dashes or slashes.')],
      email: [required('Enter your email.'), email()],
      department: [required('Enter your department.'), maxLength(80)],
      yearOfStudy: [required('Enter your year of study.'), intRange(1, 8)],
      consent: [consent('Please confirm your details are correct.')]
    };
    if (symposium) { schema.teamSize = [required('Enter your team size.'), intRange(1, 4, 'Team size must be between 1 and 4.')]; schema.track = [required('Choose a track.'), oneOf(TRACKS)]; }
    bindForm(form, schema, (v) => { values = v; stepReview(); });
  }

  function stepReview() {
    m.body.innerHTML = `${steps(2)}<div class="review-box"><dl class="kv">
      <dt>Event</dt><dd>${esc(event.title)}</dd><dt>When</dt><dd>${esc(dt(event.startsAt))}</dd><dt>Name</dt><dd>${esc(values.fullName)}</dd>
      <dt>Registration no.</dt><dd>${esc(values.registrationNo)}</dd><dt>Email</dt><dd>${esc(values.email)}</dd><dt>Department</dt><dd>${esc(values.department)}, year ${esc(values.yearOfStudy)}</dd>
      ${symposium ? `<dt>Team</dt><dd>${esc(values.teamSize)} member(s), ${esc(values.track)}</dd>` : ''}
      ${event.fee > 0 ? `<dt>Fee</dt><dd>${esc(inr(event.fee))}</dd>` : ''}</dl></div>
      ${event.fee > 0 ? notice('info', 'Payment is not collected in CampusSphere. Follow the organizer instructions for any fee.') : ''}
      <div data-error></div>
      <div class="modal__actions"><button class="button button--secondary" type="button" data-back>Back</button><button class="button" type="button" data-confirm>Confirm registration</button></div>`;
    m.body.querySelector('[data-back]').addEventListener('click', () => stepDetails());
    const confirmBtn = m.body.querySelector('[data-confirm]');
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.classList.add('is-loading');
      try {
        const { registration } = await request(`/events/${event.id}/register`, { method: 'POST', body: { ...values, consent: true, confirm: true } });
        stepDone(registration);
      } catch (e) {
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('is-loading');
        if (e.code === 'VALIDATION_ERROR') { stepDetails(Object.values(e.details || {})[0] || e.message); return; }
        if (e.status === 401) { location.assign(`/login?next=${encodeURIComponent(location.pathname)}`); return; }
        m.body.querySelector('[data-error]').innerHTML = notice('error', e.message);
        if (['EVENT_FULL', 'REGISTRATION_CLOSED', 'ALREADY_REGISTERED'].includes(e.code)) onDone?.();
      }
    });
  }

  function stepDone(registration) {
    m.body.innerHTML = `${steps(3)}${notice('success', 'You are registered. This confirmation comes from the saved registration record.')}
      <div class="review-box"><dl class="kv"><dt>Reference</dt><dd><strong>${esc(registration.referenceNo)}</strong></dd><dt>Status</dt><dd>${esc(registration.status.toLowerCase())}</dd><dt>Event</dt><dd>${esc(event.title)}</dd><dt>When</dt><dd>${esc(dt(event.startsAt))}</dd></dl></div>
      <p class="small muted">You can find this under Events > My events, and cancel it there until the event starts.</p>
      <div class="modal__actions"><a class="button button--secondary" href="/events?view=mine">View my events</a><button class="button" type="button" data-done>Done</button></div>`;
    m.body.querySelector('[data-done]').addEventListener('click', m.close);
    toast('Registration confirmed.');
    onDone?.(registration);
  }
  stepDetails();
}
