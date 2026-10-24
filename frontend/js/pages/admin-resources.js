import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, badge, pageHead, skeletons, emptyState, errorState, pager, table, qs, debounce, on, modal, field, fields, formRow, formError, showFormError, toast, notice, attempt, confirmDialog, tabs } from '../kit.js';
import { bindForm, required, minLength, maxLength, oneOf, httpsUrl } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/admin/resources', crumbs: [['Administration'], ['Resource Management']], requireAuth: true });
if (!user.permissions.includes('resource:manage')) { view.innerHTML = pageHead({ title: 'Resource management', eyebrow: 'Restricted' }) + notice('error', 'Only campus administrators can manage resources.'); await new Promise(() => {}); }

const KINDS = ['DEPARTMENT', 'LIBRARY', 'FACILITY', 'SUPPORT', 'SERVICE', 'CLUB', 'LINK', 'ORGANIZATION'];
const state = { page: 1, rows: [], cats: [] };
view.innerHTML = `${pageHead({ eyebrow: 'Administration', title: 'Resource management', lead: 'Maintain the campus directory, its categories, and the request forms students fill in.' })}<div data-tabs></div><div data-panel></div>`;
const panel = $('[data-panel]');

async function loadCats() { ({ categories: state.cats } = await request('/admin/categories')); }

async function resources() {
  panel.innerHTML = `<div class="row row--between" style="margin-bottom:12px"><span></span><button class="button" type="button" data-new>New resource</button></div>
    <form class="toolbar" data-f role="search" novalidate><div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="60" placeholder="Title"></div>${field({ name: 'kind', label: 'Type', type: 'select', placeholder: 'All types', options: KINDS.map((k) => [k, label(k)]) })}<button class="button button--secondary" type="reset">Clear</button></form>
    <div data-list aria-live="polite"></div><div class="pager" data-pager></div>`;
  const f = panel.querySelector('[data-f]');
  const list = panel.querySelector('[data-list]');
  const draw = async () => {
    list.innerHTML = skeletons(4, 'skeleton-row');
    try {
      const data = await request(`/admin/resources?${qs({ ...Object.fromEntries(new FormData(f)), page: state.page })}`);
      state.rows = data.resources;
      list.innerHTML = data.resources.length ? table([{ label: 'Resource', html: (r) => `<strong>${esc(r.title)}</strong> <br><span class="muted small">${esc(label(r.kind))}${r.category ? ` · ${esc(r.category.name)}` : ''}</span>` }, { label: 'Availability', html: (r) => badge(r.status) }, { label: 'Visible', html: (r) => badge(r.published ? 'PUBLISHED' : 'DRAFT', r.published ? 'Published' : 'Hidden') }, { label: 'Requests', html: (r) => (r.acceptsRequests ? 'Accepts requests' : '–') }, { label: '', html: (r) => `<div class="row"><button class="button button--secondary button--sm" type="button" data-edit="${r.id}">Edit</button><button class="button button--ghost button--sm" type="button" data-delete="${r.id}">Delete</button></div>` }], data.resources) : emptyState('No resources', 'Create a resource to add it to the directory.');
      pager(panel.querySelector('[data-pager]'), data, (p) => { state.page = p; draw(); });
    } catch (e) { list.innerHTML = errorState(e.message); }
  };
  const reload = () => { state.page = 1; draw(); };
  f.addEventListener('input', debounce(reload, 300));
  f.addEventListener('change', reload);
  f.addEventListener('reset', () => setTimeout(reload));
  f.addEventListener('submit', (e) => e.preventDefault());
  panel.dataset.reload = 'resources';
  draw();
}

const EXAMPLE_FIELDS = JSON.stringify([{ name: 'purpose', label: 'Purpose', type: 'select', required: true, options: ['Option A', 'Option B'] }, { name: 'details', label: 'Details', type: 'textarea', required: true }], null, 2);

async function editor(r) {
  if (!state.cats.length) await loadCats();
  const x = r || {};
  const m = modal({
    title: r ? 'Edit resource' : 'New resource', wide: true,
    body: `<form class="form" novalidate>${formError}
      ${formRow({ name: 'kind', label: 'Type', type: 'select', required: true, options: KINDS.map((k) => [k, label(k)]), value: x.kind }, { name: 'categoryId', label: 'Category', type: 'select', options: state.cats.map((c) => [c.id, c.name]), value: x.categoryId })}
      ${fields([{ name: 'title', label: 'Title', required: true, value: x.title, maxlength: 120 }, { name: 'summary', label: 'Summary', required: true, value: x.summary, maxlength: 300 }, { name: 'details', label: 'Details', type: 'textarea', rows: 3, value: x.details, maxlength: 3000 }])}
      ${formRow({ name: 'author', label: 'Author (library items)', value: x.author, maxlength: 120 }, { name: 'status', label: 'Availability', type: 'select', required: true, options: [['AVAILABLE', 'Available'], ['LIMITED', 'Limited'], ['UNAVAILABLE', 'Unavailable']], value: x.status || 'AVAILABLE' })}
      ${fields([{ name: 'eligibility', label: 'Eligibility', value: x.eligibility, maxlength: 500 }, { name: 'instructions', label: 'Instructions', type: 'textarea', rows: 2, value: x.instructions, maxlength: 2000 }, { name: 'requiredDocuments', label: 'Required documents (one per line)', type: 'textarea', rows: 2, value: (x.requiredDocuments || []).join('\n') }, { name: 'contactInfo', label: 'Verified contact information', value: x.contactInfo, maxlength: 300, hint: 'Only enter contact details you have verified. Leave blank otherwise.' }, { name: 'imageUrl', label: 'Image (https link)', type: 'url', value: x.imageUrl }])}
      ${fields([{ name: 'acceptsRequests', label: 'Students can send requests to this resource', type: 'checkbox', value: x.acceptsRequests }, { name: 'formFields', label: 'Request form fields (JSON)', type: 'textarea', rows: 6, value: x.formFields ? JSON.stringify(x.formFields, null, 2) : '', hint: `Needed when requests are enabled. Types: text, textarea, select (with options), date, number. Example: ${EXAMPLE_FIELDS.replace(/\s+/g, ' ').slice(0, 140)}…` }, { name: 'published', label: 'Published (visible to students)', type: 'checkbox', value: r ? x.published : true }])}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">${r ? 'Save changes' : 'Create resource'}</button></div></form>`
  });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { kind: [required('Choose a type.'), oneOf(KINDS)], title: [required('Enter a title.'), minLength(2), maxLength(120)], summary: [required('Enter a summary.'), maxLength(300)], status: [required('Choose an availability.')], imageUrl: [httpsUrl()], details: [maxLength(3000)] }, async (v) => {
    showFormError(form, '');
    await request(r ? `/admin/resources/${r.id}` : '/admin/resources', { method: r ? 'PUT' : 'POST', body: { ...v, acceptsRequests: v.acceptsRequests, published: v.published, categoryId: v.categoryId || null } });
    toast('Resource saved.');
    m.close();
    resources();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); else showFormError(form, Object.values(e.details || {})[0]); } });
}

async function categories() {
  panel.innerHTML = skeletons(2, 'skeleton-row');
  panel.dataset.reload = 'categories';
  try {
    await loadCats();
    panel.innerHTML = `<div class="row row--between" style="margin-bottom:12px"><span class="muted small">Categories group resources in the directory.</span><button class="button" type="button" data-new-cat>New category</button></div>${state.cats.length ? table([{ label: 'Name', html: (c) => `<strong>${esc(c.name)}</strong><br><span class="muted small">${esc(c.description || '')}</span>` }, { label: 'Resources', html: (c) => c._count.resources }, { label: '', html: (c) => `<div class="row"><button class="button button--secondary button--sm" type="button" data-edit-cat="${c.id}">Rename</button><button class="button button--ghost button--sm" type="button" data-del-cat="${c.id}">Delete</button></div>` }], state.cats) : emptyState('No categories', 'Create one to organise resources.')}`;
  } catch (e) { panel.innerHTML = errorState(e.message); }
}

function catDialog(c) {
  const m = modal({ title: c ? 'Edit category' : 'New category', body: `<form class="form" novalidate>${formError}${fields([{ name: 'name', label: 'Name', required: true, value: c?.name, maxlength: 60 }, { name: 'description', label: 'Description', value: c?.description, maxlength: 200 }])}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Save</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { name: [required('Enter a name.'), minLength(2), maxLength(60)], description: [maxLength(200)] }, async (v) => {
    showFormError(form, '');
    await request(c ? `/admin/categories/${c.id}` : '/admin/categories', { method: c ? 'PUT' : 'POST', body: v });
    toast('Category saved.');
    m.close();
    categories();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

on(view, 'click', {
  '[data-new]': () => editor(),
  '[data-edit]': (b) => editor(state.rows.find((r) => r.id === b.dataset.edit)),
  '[data-delete]': async (b) => { const r = state.rows.find((x) => x.id === b.dataset.delete); if (!(await confirmDialog({ title: 'Delete resource?', message: `"${r.title}" will be removed. Resources with requests cannot be deleted; hide them instead.`, confirmLabel: 'Delete', danger: true }))) return; await attempt(() => request(`/admin/resources/${r.id}`, { method: 'DELETE' }), { success: 'Resource deleted.' }); resources(); },
  '[data-new-cat]': () => catDialog(),
  '[data-edit-cat]': (b) => catDialog(state.cats.find((c) => c.id === b.dataset.editCat)),
  '[data-del-cat]': async (b) => { const c = state.cats.find((x) => x.id === b.dataset.delCat); if (!(await confirmDialog({ title: 'Delete category?', message: `"${c.name}" will be deleted. Categories that still contain resources cannot be deleted.`, confirmLabel: 'Delete', danger: true }))) return; await attempt(() => request(`/admin/categories/${c.id}`, { method: 'DELETE' }), { success: 'Category deleted.' }); categories(); },
  '[data-retry]': () => (panel.dataset.reload === 'categories' ? categories() : resources())
});
tabs($('[data-tabs]'), [['resources', 'Resources'], ['categories', 'Categories']], 'resources', (t) => (t === 'resources' ? resources() : categories()));
resources();
