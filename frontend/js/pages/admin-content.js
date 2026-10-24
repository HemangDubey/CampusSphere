import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, label, badge, pageHead, skeletons, emptyState, errorState, pager, table, qs, debounce, on, modal, field, fields, formRow, formError, showFormError, toast, notice, attempt, confirmDialog, tabs, ago } from '../kit.js';
import { bindForm, required, minLength, maxLength, intRange, oneOf, pattern, httpsUrl } from '../validators.js';

const view = $('[data-view]');
const user = await initShell({ active: '/admin/content', crumbs: [['Administration'], ['Content & Announcements']], requireAuth: true });
if (!user.permissions.includes('content:manage')) { view.innerHTML = pageHead({ title: 'Content', eyebrow: 'Restricted' }) + notice('error', 'Only campus administrators can manage content.'); await new Promise(() => {}); }

const state = { page: 1, rows: [], anns: [] };
const TYPES = ['HERITAGE', 'NATURE', 'SPIRITUAL', 'BEACH', 'CITY'];
view.innerHTML = `${pageHead({ eyebrow: 'Administration', title: 'Content and announcements', lead: 'Publish travel destinations and campus announcements.' })}<div data-tabs></div><div data-panel></div>`;
const panel = $('[data-panel]');

async function destinations() {
  panel.dataset.reload = 'destinations';
  panel.innerHTML = `<div class="row row--between" style="margin-bottom:12px"><span class="muted small">Destination budgets are estimates; label them as such.</span><button class="button" type="button" data-new-dest>New destination</button></div>
    <form class="toolbar" data-f role="search" novalidate><div class="field field--wide"><label class="field__label" for="q">Search</label><input class="input" id="q" name="q" type="search" maxlength="60"></div><button class="button button--secondary" type="reset">Clear</button></form><div data-list></div><div class="pager" data-pager></div>`;
  const f = panel.querySelector('[data-f]');
  const draw = async () => {
    const list = panel.querySelector('[data-list]');
    list.innerHTML = skeletons(3, 'skeleton-row');
    try {
      const data = await request(`/admin/destinations?${qs({ ...Object.fromEntries(new FormData(f)), page: state.page })}`);
      state.rows = data.destinations;
      list.innerHTML = data.destinations.length ? table([{ label: 'Destination', html: (d) => `<strong>${esc(d.name)}</strong> <br><span class="muted small">${esc(d.region)} · ${esc(label(d.type))}</span>` }, { label: 'Visible', html: (d) => badge(d.published ? 'PUBLISHED' : 'DRAFT', d.published ? 'Published' : 'Hidden') }, { label: 'Popularity', key: 'popularity' }, { label: '', html: (d) => `<div class="row"><button class="button button--secondary button--sm" type="button" data-edit-dest="${d.id}">Edit</button><button class="button button--ghost button--sm" type="button" data-del-dest="${d.id}">Delete</button></div>` }], data.destinations) : emptyState('No destinations', 'Create one to share it with students.');
      pager(panel.querySelector('[data-pager]'), data, (p) => { state.page = p; draw(); });
    } catch (e) { list.innerHTML = errorState(e.message); }
  };
  const reload = () => { state.page = 1; draw(); };
  f.addEventListener('input', debounce(reload, 300));
  f.addEventListener('reset', () => setTimeout(reload));
  f.addEventListener('submit', (e) => e.preventDefault());
  draw();
}

function destDialog(d) {
  const x = d || {};
  const m = modal({
    title: d ? 'Edit destination' : 'New destination', wide: true,
    body: `<form class="form" novalidate>${formError}${formRow({ name: 'name', label: 'Name', required: true, value: x.name, maxlength: 80 }, { name: 'slug', label: 'URL slug', required: true, value: x.slug, hint: 'lowercase-with-dashes', maxlength: 60 })}
      ${formRow({ name: 'region', label: 'Region', required: true, value: x.region, maxlength: 80 }, { name: 'type', label: 'Category', type: 'select', required: true, options: TYPES.map((t) => [t, label(t)]), value: x.type })}
      ${formRow({ name: 'budget', label: 'Budget category', type: 'select', required: true, options: [['BUDGET', 'Budget'], ['MODERATE', 'Moderate'], ['PREMIUM', 'Premium']], value: x.budget }, { name: 'recommendedDays', label: 'Suggested days', type: 'number', required: true, min: 1, max: 30, value: x.recommendedDays })}
      ${formRow({ name: 'budgetMinInr', label: 'Lowest estimate (₹)', type: 'number', required: true, min: 0, value: x.budgetMinInr }, { name: 'budgetMaxInr', label: 'Highest estimate (₹)', type: 'number', required: true, min: 0, value: x.budgetMaxInr })}
      ${formRow({ name: 'distanceKm', label: 'Approx. distance (km)', type: 'number', min: 1, value: x.distanceKm }, { name: 'bestTime', label: 'Best time to visit', value: x.bestTime, maxlength: 120 })}
      ${fields([{ name: 'summary', label: 'Summary', required: true, value: x.summary, maxlength: 200 }, { name: 'description', label: 'Description', type: 'textarea', required: true, rows: 4, value: x.description, maxlength: 4000 }, { name: 'activities', label: 'Things to do (one per line)', type: 'textarea', rows: 3, value: (x.activities || []).join('\n') }, { name: 'tips', label: 'Student tips (one per line)', type: 'textarea', rows: 3, value: (x.tips || []).join('\n') }, { name: 'imageUrl', label: 'Cover image (https link)', type: 'url', value: x.imageUrl }, { name: 'gallery', label: 'Gallery image links (one https link per line)', type: 'textarea', rows: 2, value: (x.gallery || []).join('\n') }, { name: 'published', label: 'Published', type: 'checkbox', value: d ? x.published : true }])}
      <div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">${d ? 'Save changes' : 'Create destination'}</button></div></form>`
  });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, {
    name: [required('Enter a name.'), minLength(2), maxLength(80)], slug: [required('Enter a slug.'), pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes.')], region: [required('Enter a region.')], type: [required('Choose a category.'), oneOf(TYPES)], budget: [required('Choose a budget category.')],
    recommendedDays: [required('Enter the suggested days.'), intRange(1, 30)], budgetMinInr: [required('Enter the lowest estimate.'), intRange(0, 1000000)], budgetMaxInr: [required('Enter the highest estimate.'), intRange(0, 1000000), (v, a) => (v && a.budgetMinInr && Number(v) < Number(a.budgetMinInr) ? 'The highest estimate cannot be below the lowest.' : null)],
    summary: [required('Enter a summary.'), maxLength(200)], description: [required('Enter a description.'), minLength(20), maxLength(4000)], imageUrl: [httpsUrl()]
  }, async (v) => {
    showFormError(form, '');
    await request(d ? `/admin/destinations/${d.id}` : '/admin/destinations', { method: d ? 'PUT' : 'POST', body: { ...v, published: v.published } });
    toast('Destination saved.');
    m.close();
    destinations();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); else showFormError(form, Object.values(e.details || {})[0]); } });
}

async function announcements() {
  panel.dataset.reload = 'announcements';
  panel.innerHTML = skeletons(2, 'skeleton-row');
  try {
    ({ announcements: state.anns } = await request('/admin/announcements'));
    panel.innerHTML = `<div class="row row--between" style="margin-bottom:12px"><span class="muted small">Published announcements appear on the dashboard and the community page.</span><button class="button" type="button" data-new-ann>New announcement</button></div>${state.anns.length ? table([{ label: 'Announcement', html: (a) => `<strong>${esc(a.title)}</strong> <br><span class="muted small">${esc(a.body.slice(0, 120))}${a.body.length > 120 ? '…' : ''}</span>` }, { label: 'Status', html: (a) => badge(a.status) }, { label: 'Updated', html: (a) => esc(ago(a.updatedAt)) }, { label: '', html: (a) => `<div class="row"><button class="button button--secondary button--sm" type="button" data-edit-ann="${a.id}">Edit</button><button class="button button--ghost button--sm" type="button" data-del-ann="${a.id}">Delete</button></div>` }], state.anns) : emptyState('No announcements', 'Write one to share news with students.')}`;
  } catch (e) { panel.innerHTML = errorState(e.message); }
}

function annDialog(a) {
  const m = modal({ title: a ? 'Edit announcement' : 'New announcement', body: `<form class="form" novalidate>${formError}${fields([{ name: 'title', label: 'Title', required: true, value: a?.title, maxlength: 120 }, { name: 'body', label: 'Text', type: 'textarea', required: true, rows: 5, value: a?.body, maxlength: 2000 }, { name: 'status', label: 'Status', type: 'select', required: true, options: [['DRAFT', 'Draft'], ['PUBLISHED', 'Published']], value: a?.status || 'DRAFT' }])}<div class="modal__actions"><button class="button button--secondary" type="button" data-cancel>Cancel</button><button class="button" type="submit">Save</button></div></form>` });
  const form = m.body.querySelector('form');
  form.querySelector('[data-cancel]').addEventListener('click', m.close);
  bindForm(form, { title: [required('Enter a title.'), minLength(3), maxLength(120)], body: [required('Enter the text.'), minLength(10), maxLength(2000)], status: [required('Choose a status.'), oneOf(['DRAFT', 'PUBLISHED'])] }, async (v) => {
    showFormError(form, '');
    await request(a ? `/admin/announcements/${a.id}` : '/admin/announcements', { method: a ? 'PUT' : 'POST', body: v });
    toast('Announcement saved.');
    m.close();
    announcements();
  }, { onServerError: (e) => { if (e.code !== 'VALIDATION_ERROR') showFormError(form, e.message); } });
}

on(view, 'click', {
  '[data-new-dest]': () => destDialog(),
  '[data-edit-dest]': (b) => destDialog(state.rows.find((d) => d.id === b.dataset.editDest)),
  '[data-del-dest]': async (b) => { const d = state.rows.find((x) => x.id === b.dataset.delDest); if (!(await confirmDialog({ title: 'Delete destination?', message: `"${d.name}" will be deleted along with students' saved copies and trip links.`, confirmLabel: 'Delete', danger: true }))) return; await attempt(() => request(`/admin/destinations/${d.id}`, { method: 'DELETE' }), { success: 'Destination deleted.' }); destinations(); },
  '[data-new-ann]': () => annDialog(),
  '[data-edit-ann]': (b) => annDialog(state.anns.find((a) => a.id === b.dataset.editAnn)),
  '[data-del-ann]': async (b) => { if (!(await confirmDialog({ title: 'Delete announcement?', message: 'It will be removed for everyone.', confirmLabel: 'Delete', danger: true }))) return; await attempt(() => request(`/admin/announcements/${b.dataset.delAnn}`, { method: 'DELETE' }), { success: 'Announcement deleted.' }); announcements(); },
  '[data-retry]': () => (panel.dataset.reload === 'announcements' ? announcements() : destinations())
});
tabs($('[data-tabs]'), [['destinations', 'Travel destinations'], ['announcements', 'Announcements']], 'destinations', (t) => (t === 'destinations' ? destinations() : announcements()));
destinations();
