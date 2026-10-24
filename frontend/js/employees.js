import { renderNav, renderFooter, initReveal } from './layout.js';
import { authApi, request } from './api.js';
import { esc, notice, emptyHtml, pagination, debounce, toast } from './ui.js';
import { bindForm, required, minLength, maxLength, email, phoneIN, pattern, pastDate } from './validators.js';

renderNav('/employees');
renderFooter();
initReveal();

const $ = (s) => document.querySelector(s);
const list = $('[data-list]');
const filters = $('[data-filters]');
const dialog = $('[data-dialog]');
const form = $('[data-form]');
const state = { page: 1, items: [], editing: null };

// The UI hides this page from non-admins, but the API enforces the rule independently.
function card(e) {
  return `<article class="card-item"><div class="card-item__tags"><span class="chip">${esc(e.employeeId)}</span>${e.isDemo ? '<span class="chip chip--demo">Sample</span>' : ''}</div>
    <h3>${esc(e.name)}</h3><div class="card-item__meta"><span>${esc(e.designation)}</span><span>${esc(e.department)}</span></div>
    <div class="card-item__actions"><button class="button button--ghost button--sm" data-view="${e.id}">Profile</button><button class="button button--secondary button--sm" data-edit="${e.id}">Edit</button></div></article>`;
}

async function load() {
  list.innerHTML = Array.from({ length: 3 }, () => '<div class="skeleton skeleton-card"></div>').join('');
  try {
    const p = new URLSearchParams();
    new FormData(filters).forEach((v, k) => { if (String(v).trim()) p.set(k, String(v).trim()); });
    p.set('page', state.page);
    const data = await request(`/employees?${p}`);
    state.items = data.employees;
    const cur = $('#dept').value;
    $('#dept').innerHTML = '<option value="">All departments</option>' + data.departments.map((d) => `<option>${esc(d)}</option>`).join('');
    $('#dept').value = data.departments.includes(cur) ? cur : '';
    $('[data-count]').textContent = `${data.total} employee${data.total === 1 ? '' : 's'}`;
    list.innerHTML = data.employees.length ? data.employees.map(card).join('') : `<div style="grid-column:1/-1">${emptyHtml('No employees found', 'Adjust the search or add a new employee.')}</div>`;
    pagination($('[data-pager]'), data, (n) => { state.page = n; load(); });
  } catch (e) {
    list.innerHTML = `<div style="grid-column:1/-1">${notice('error', e.message)}</div>`;
  }
}

function openView(e) {
  state.editing = null;
  $('[data-dlg-title]').textContent = e.name;
  form.hidden = true;
  const v = $('[data-profile]');
  v.hidden = false;
  v.innerHTML = `<dl class="kv"><dt>Employee ID</dt><dd>${esc(e.employeeId)}</dd><dt>Designation</dt><dd>${esc(e.designation)}</dd><dt>Department</dt><dd>${esc(e.department)}</dd>
    <dt>Email</dt><dd>${esc(e.email)}</dd><dt>Mobile</dt><dd>${esc(e.phone || 'Not provided')}</dd><dt>Joined</dt><dd>${esc(e.joinedOn)}</dd></dl>
    <div class="card-item__actions"><button class="button button--secondary button--sm" data-del="${e.id}">Delete employee</button></div>`;
  dialog.showModal();
}

function openForm(e) {
  state.editing = e || null;
  $('[data-dlg-title]').textContent = e ? 'Edit employee' : 'Add employee';
  $('[data-profile]').hidden = true;
  form.hidden = false;
  form.reset();
  $('[data-form-error]').hidden = true;
  form.querySelectorAll('.is-invalid').forEach((f) => f.classList.remove('is-invalid'));
  form.querySelectorAll('.field__error').forEach((f) => { f.textContent = ''; });
  if (e) ['employeeId', 'name', 'designation', 'department', 'email', 'phone', 'joinedOn'].forEach((k) => { form.elements[k].value = e[k] ?? ''; });
  form.elements.joinedOn.max = new Date().toISOString().slice(0, 10);
  dialog.showModal();
}

list.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.view) openView(state.items.find((x) => x.id === t.dataset.view));
  if (t.dataset.edit) openForm(state.items.find((x) => x.id === t.dataset.edit));
});
$('[data-profile]').addEventListener('click', async (ev) => {
  const id = ev.target.closest('[data-del]')?.dataset.del;
  if (!id || !confirm('Delete this employee record? This cannot be undone.')) return;
  try { await request(`/employees/${id}`, { method: 'DELETE' }); toast('Employee deleted.'); dialog.close(); load(); } catch (e) { toast(e.message, 'error'); }
});
$('[data-new]').addEventListener('click', () => openForm(null));
$('[data-close]').addEventListener('click', () => dialog.close());

bindForm(form, {
  employeeId: [required('Enter an employee ID.'), pattern(/^[A-Z]{2,4}-\d{3,6}$/, 'Use a format like EMP-1001 (2-4 capital letters, a dash, 3-6 digits).')],
  name: [required('Enter the employee name.'), minLength(2), maxLength(80)],
  designation: [required('Enter a designation.'), maxLength(80)],
  department: [required('Enter a department.'), maxLength(80)],
  email: [required('Enter an email address.'), email()],
  phone: [phoneIN()],
  joinedOn: [required('Enter the joining date.'), pastDate('The joining date cannot be in the future.')]
}, async (values) => {
  const editing = state.editing;
  await request(editing ? `/employees/${editing.id}` : '/employees', { method: editing ? 'PUT' : 'POST', body: values });
  toast(editing ? 'Employee updated.' : 'Employee added.');
  dialog.close();
  load();
}, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR' && e.code !== 'DUPLICATE') { const b = $('[data-form-error]'); b.querySelector('p').textContent = e.message; b.hidden = false; } } });

const reload = () => { state.page = 1; load(); };
filters.addEventListener('input', debounce(reload, 300));
filters.addEventListener('change', reload);
filters.addEventListener('submit', (e) => e.preventDefault());

function gate(kind, text) {
  const g = $('[data-gate]');
  g.className = `notice notice--${kind}`;
  g.querySelector('p').innerHTML = text;
}

authApi.me().then(({ user }) => {
  if (user.role !== 'ADMIN') { gate('warning', 'This page is for administrators only. Your account does not have access.'); return; }
  $('[data-gate]').hidden = true;
  $('[data-admin]').hidden = false;
  load();
}).catch(() => gate('info', 'Please <a class="auth__link" href="/login?next=/employees">sign in</a> with an administrator account.'));
