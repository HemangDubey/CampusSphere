import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, pageHead, skeletons, emptyState, errorState, pager, qs, debounce, on, modal, fields, formRow, formError, showFormError, toast, notice, attempt, confirmDialog } from '../kit.js';
import { bindForm, required, minLength, maxLength, email, phoneIN, pattern, pastDate } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/employees', crumbs: [['Administration'], ['Employee Records']], requireAuth: true });
if (!user.permissions.includes('employee:manage')) { view.innerHTML = pageHead({ title: 'Employee records', eyebrow: 'Restricted' }) + notice('error', 'Employee records are private. Only campus and super administrators can view them.'); await new Promise(() => {}); }
const state = { page: 1, rows: [] };

view.innerHTML = `${pageHead({ eyebrow: 'Administration', title: 'Employee records', lead: 'Employee profiles and registration. Seeded records are fictional samples.', actions: '<button class="button" type="button" data-new>Add employee</button>' })}
  <form class="toolbar" data-filters role="search" novalidate><div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="80" placeholder="Name, ID or designation"></div><div class="field"><label class="field__label" for="dept">Department</label><select class="select" id="dept" name="department"><option value="">All departments</option></select></div><button class="button button--secondary" type="reset">Clear</button></form>
  <p class="results-note" data-count></p><div class="grid grid--cards" data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
const list = $('[data-list]');
const filters = $('[data-filters]');

const card = (e) => `<article class="card" data-id="${e.id}"><div class="chips"><span class="badge badge--muted">${esc(e.employeeId)}</span></div><h3>${esc(e.name)}</h3><p class="small">${esc(e.designation)}<br>${esc(e.department)}</p><div class="row"><button class="button button--secondary button--sm" type="button" data-view>Profile</button><button class="button button--secondary button--sm" type="button" data-edit>Edit</button></div></article>`;

async function load() {
  list.innerHTML = skeletons(3);
  try {
    const data = await request(`/employees?${qs({ ...Object.fromEntries(new FormData(filters)), page: state.page })}`);
    state.rows = data.employees;
    const cur = $('#dept').value;
    $('#dept').innerHTML = `<option value="">All departments</option>${data.departments.map((d) => `<option>${esc(d)}</option>`).join('')}`;
    $('#dept').value = data.departments.includes(cur) ? cur : '';
    $('[data-count]').textContent = `${data.total} employee${data.total === 1 ? '' : 's'}`;
    list.innerHTML = data.employees.length ? data.employees.map(card).join('') : `<div style="grid-column:1/-1">${emptyState('No employees found', 'Adjust the search or add a new employee.')}</div>`;
    pager($('[data-pager]'), data, (p) => { state.page = p; load(); });
  } catch (e) { list.innerHTML = `<div style="grid-column:1/-1">${errorState(e.message)}</div>`; }
}

function profile(e) {
  const m = modal({ title: e.name, body: `<dl class="kv"><dt>Employee ID</dt><dd>${esc(e.employeeId)}</dd><dt>Designation</dt><dd>${esc(e.designation)}</dd><dt>Department</dt><dd>${esc(e.department)}</dd><dt>Email</dt><dd>${esc(e.email)}</dd><dt>Mobile</dt><dd>${esc(e.phone || 'Not provided')}</dd><dt>Joined</dt><dd>${esc(e.joinedOn)}</dd></dl><div class="modal__actions"><button class="button button--secondary" type="button" data-del>Delete employee</button></div>` });
  m.body.querySelector('[data-del]').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Delete this employee record?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    await attempt(() => request(`/employees/${e.id}`, { method: 'DELETE' }), { success: 'Employee deleted.' });
    m.close();
    load();
  });
}

function editor(e) {
  const x = e || {};
  const m = modal({ title: e ? 'Edit employee' : 'Add employee', body: `<form class="form" novalidate>${formError}${formRow({ name: 'employeeId', label: 'Employee ID', required: true, value: x.employeeId, placeholder: 'EMP-1001', maxlength: 11 }, { name: 'name', label: 'Full name', required: true, value: x.name, maxlength: 80 })}${formRow({ name: 'designation', label: 'Designation', required: true, value: x.designation, maxlength: 80 }, { name: 'department', label: 'Department', required: true, value: x.department, maxlength: 80 })}${formRow({ name: 'email', label: 'Email', type: 'email', required: true, value: x.email }, { name: 'phone', label: 'Mobile', type: 'tel', value: x.phone })}${fields([{ name: 'joinedOn', label: 'Joining date', type: 'date', required: true, value: x.joinedOn, max: new Date().toISOString().slice(0, 10) }])}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Save employee</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, {
    employeeId: [required('Enter an employee ID.'), pattern(/^[A-Z]{2,4}-\d{3,6}$/, 'Use a format like EMP-1001 (2-4 capital letters, a dash, 3-6 digits).')], name: [required('Enter the employee name.'), minLength(2), maxLength(80)],
    designation: [required('Enter a designation.'), maxLength(80)], department: [required('Enter a department.'), maxLength(80)], email: [required('Enter an email address.'), email()], phone: [phoneIN()], joinedOn: [required('Enter the joining date.'), pastDate('The joining date cannot be in the future.')]
  }, async (v) => {
    showFormError(form, '');
    await request(e ? `/employees/${e.id}` : '/employees', { method: e ? 'PUT' : 'POST', body: v });
    toast(e ? 'Employee updated.' : 'Employee added.');
    m.close();
    load();
  }, { onServerError: (err) => { if (err.code !== 'VALIDATION_ERROR' && err.code !== 'DUPLICATE') showFormError(form, err.message); } });
}

on(view, 'click', {
  '[data-new]': () => editor(),
  '[data-view]': (b) => profile(state.rows.find((x) => x.id === b.closest('[data-id]').dataset.id)),
  '[data-edit]': (b) => editor(state.rows.find((x) => x.id === b.closest('[data-id]').dataset.id)),
  '[data-retry]': load
});
const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('reset', () => setTimeout(reload));
filters.addEventListener('submit', (e) => e.preventDefault());

load();
