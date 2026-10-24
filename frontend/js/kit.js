// Shared UI building blocks for the application pages: dialogs, badges, covers, form fields, table/page helpers.
// Everything that comes from the API goes through esc() before it reaches innerHTML.
import { esc, label, fmtDate, fmtTime, toast, debounce } from './ui.js';

export { esc, label, fmtDate, fmtTime, toast, debounce };
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export const dt = (iso) => (iso ? `${new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '');
export const dOnly = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const ago = (iso) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return dOnly(iso);
};
export const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
export const qs = (obj) => { const p = new URLSearchParams(); Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v).trim() !== '') p.set(k, String(v).trim()); }); return p.toString(); };

// ---------------------------------------------------------------- status badges
const TONES = {
  success: ['APPROVED', 'CONFIRMED', 'REGISTERED', 'COMPLETED', 'PUBLISHED', 'ACTIVE', 'AVAILABLE', 'OPEN', 'DONE'],
  warn: ['SUBMITTED', 'REQUESTED', 'UNDER_REVIEW', 'INFO_REQUIRED', 'RESCHEDULE_REQUESTED', 'DRAFT', 'LIMITED', 'READING', 'WANT_TO_READ', 'BLOCKED'],
  danger: ['REJECTED', 'CANCELLED', 'SUSPENDED', 'UNAVAILABLE', 'WITHDRAWN', 'BOOKED']
};
export function badge(status, text) {
  const tone = Object.keys(TONES).find((t) => TONES[t].includes(status)) || 'muted';
  return `<span class="badge badge--${tone}">${esc(text || label(status))}</span>`;
}

// ---------------------------------------------------------------- covers (photo with a generated fallback)
const TONE_BY_KEY = { TECHNICAL: 'ocean', CULTURAL: 'pink', SPORTS: 'teal', WORKSHOP: 'sand', SYMPOSIUM: 'ocean', HERITAGE: 'pink', NATURE: 'teal', SPIRITUAL: 'sand', BEACH: 'ocean', CITY: 'ink', LIBRARY: 'sand', DEPARTMENT: 'ocean', FACILITY: 'teal', SUPPORT: 'pink', SERVICE: 'ocean', CLUB: 'teal', LINK: 'sand', ORGANIZATION: 'ink' };
// Category photos in /img/stock (see CREDITS.md there). They show a type of place or activity, never a specific item.
const STOCK = new Set(['library', 'department', 'facility', 'support', 'service', 'link', 'organization', 'club', 'project_group', 'technical', 'cultural', 'sports', 'workshop', 'symposium', 'heritage', 'nature', 'spiritual', 'beach', 'city']);
export function cover(src, title, key = '', cls = '') {
  const tone = TONE_BY_KEY[key] || 'sand';
  const initial = esc(String(title || '?').trim().slice(0, 1).toUpperCase());
  const k = String(key).toLowerCase();
  const stock = `/img/stock/${STOCK.has(k) ? k : 'default'}.jpg`;
  const img = `<img src="${esc(src || stock)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-cover-img${src ? ` data-fallback="${stock}"` : ''}>`;
  return `<div class="cover cover--${tone} ${cls}" aria-hidden="true">${img}<span class="cover__letter">${initial}</span></div>`;
}
// If an item's own image fails, show the category photo; if that fails too, the generated tile underneath shows through.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!img?.matches?.('[data-cover-img]')) return;
  const fb = img.dataset.fallback;
  if (fb && !img.src.endsWith(fb)) { img.src = fb; delete img.dataset.fallback; } else img.remove();
}, true);

// ---------------------------------------------------------------- states
export const skeletons = (n = 3, cls = 'skeleton-card') => Array.from({ length: n }, () => `<div class="skeleton ${cls}"></div>`).join('');
export const emptyState = (title, text, action = '') => `<div class="empty-state"><p class="empty-state__title">${esc(title)}</p><p class="empty-state__text">${esc(text)}</p>${action}</div>`;
export const errorState = (message, retry = true) => `<div class="notice notice--error" role="alert"><span class="notice__icon" aria-hidden="true"></span><p>${esc(message)}${retry ? ' <button class="button button--secondary button--sm" type="button" data-retry>Try again</button>' : ''}</p></div>`;
export const notice = (kind, message) => `<div class="notice notice--${kind}" role="${kind === 'error' ? 'alert' : 'status'}"><span class="notice__icon" aria-hidden="true"></span><p>${esc(message)}</p></div>`;
export const disclosure = (text) => `<p class="disclosure">${esc(text)}</p>`;

export function pageHead({ eyebrow, title, lead, actions = '' }) {
  const words = String(title).split(' ');
  const last = words.pop();
  return `<div class="page-head"><div>${eyebrow ? `<span class="label label--accent">${esc(eyebrow)}</span>` : ''}<h1 class="page-head__title">${esc(words.join(' '))} <em>${esc(last)}</em></h1>${lead ? `<p class="page-head__lead">${esc(lead)}</p>` : ''}</div>${actions ? `<div class="page-head__actions">${actions}</div>` : ''}</div>`;
}

export function pager(el, data, onPage) {
  if (!data || data.totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `<button class="button button--secondary button--sm" type="button" data-p="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Previous</button><span class="pager__info">Page ${data.page} of ${data.totalPages} · ${data.total} results</span><button class="button button--secondary button--sm" type="button" data-p="${data.page + 1}" ${data.page >= data.totalPages ? 'disabled' : ''}>Next</button>`;
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => onPage(Number(b.dataset.p))));
}

// ---------------------------------------------------------------- form fields
// spec: { name, label, type, required, options: [value | [value,label]], hint, rows, min, max, maxlength, placeholder, value, autocomplete }
export function field(s) {
  const id = `f-${s.name}`;
  const req = s.required ? '<span class="req" aria-hidden="true">*</span>' : '';
  const hint = s.hint ? `<p class="field__hint" id="${id}-hint">${esc(s.hint)}</p>` : '';
  const err = '<p class="field__error"></p>';
  const desc = s.hint ? ` aria-describedby="${id}-hint"` : '';
  const val = s.value === undefined || s.value === null ? '' : s.value;
  if (s.type === 'checkbox') return `<div class="field"><label class="check"><input type="checkbox" name="${s.name}" ${val ? 'checked' : ''}><span>${esc(s.label)}</span></label>${err}</div>`;
  if (s.type === 'radio') {
    return `<fieldset class="fieldset field"><legend class="field__label">${esc(s.label)}${req}</legend>${(s.options || []).map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<label class="check"><input type="radio" name="${s.name}" value="${esc(v)}" ${String(val) === String(v) ? 'checked' : ''}><span>${esc(l)}</span></label>`; }).join('')}${hint}${err}</fieldset>`;
  }
  let control;
  if (s.type === 'select') {
    control = `<select class="select" id="${id}" name="${s.name}"${desc}><option value="">${esc(s.placeholder || 'Choose…')}</option>${(s.options || []).map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  } else if (s.type === 'textarea') {
    control = `<textarea class="textarea" id="${id}" name="${s.name}" rows="${s.rows || 3}" ${s.maxlength ? `maxlength="${s.maxlength}"` : ''} placeholder="${esc(s.placeholder || '')}"${desc}>${esc(val)}</textarea>`;
  } else {
    control = `<input class="input" id="${id}" name="${s.name}" type="${s.type || 'text'}" value="${esc(val)}" ${s.min !== undefined ? `min="${esc(s.min)}"` : ''} ${s.max !== undefined ? `max="${esc(s.max)}"` : ''} ${s.maxlength ? `maxlength="${s.maxlength}"` : ''} ${s.placeholder ? `placeholder="${esc(s.placeholder)}"` : ''} ${s.autocomplete ? `autocomplete="${s.autocomplete}"` : ''} ${s.inputmode ? `inputmode="${s.inputmode}"` : ''}${desc}>`;
  }
  return `<div class="field"><label class="field__label" for="${id}">${esc(s.label)}${req}</label>${control}${hint}${err}</div>`;
}
export const fields = (specs) => specs.map(field).join('');
export const formRow = (...specs) => `<div class="form-row">${specs.map(field).join('')}</div>`;
export const formError = '<div class="notice notice--error" data-form-error role="alert" hidden><span class="notice__icon" aria-hidden="true"></span><p></p></div>';
export function showFormError(form, message) {
  const box = form.querySelector('[data-form-error]');
  if (!box) return;
  box.querySelector('p').textContent = message || '';
  box.hidden = !message;
}

// ---------------------------------------------------------------- dialogs
export function modal({ title, body, wide = false, onClose }) {
  const dialog = document.createElement('dialog');
  dialog.className = `modal${wide ? ' modal--wide' : ''}`;
  dialog.setAttribute('aria-labelledby', 'modal-title');
  dialog.innerHTML = `<div class="modal__head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" type="button" data-modal-close aria-label="Close dialog">✕</button></div><div class="modal__body" data-modal-body>${body}</div>`;
  document.body.append(dialog);
  // Cleanup runs once, synchronously when we close it ourselves, and from the 'close' event for the Escape key.
  const cleanup = () => { if (!dialog.isConnected) return; dialog.remove(); onClose?.(); };
  const close = () => { if (dialog.open) dialog.close(); cleanup(); };
  dialog.querySelector('[data-modal-close]').addEventListener('click', close);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('close', cleanup);
  dialog.showModal();
  return { dialog, body: dialog.querySelector('[data-modal-body]'), close };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, requireReason = false, reasonLabel = 'Reason' }) {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: `<p>${esc(message)}</p>${requireReason ? field({ name: 'reason', label: reasonLabel, type: 'textarea', required: true, rows: 3 }) : ''}<div class="modal__actions"><button class="button button--secondary" type="button" data-no>Cancel</button><button class="button${danger ? ' button--danger' : ''}" type="button" data-yes>${esc(confirmLabel)}</button></div>`,
      onClose: () => resolve(false)
    });
    m.body.querySelector('[data-no]').addEventListener('click', () => m.close());
    m.body.querySelector('[data-yes]').addEventListener('click', () => {
      if (requireReason) {
        const ta = m.body.querySelector('[name=reason]');
        if (ta.value.trim().length < 5) { const f = ta.closest('.field'); f.classList.add('is-invalid'); f.querySelector('.field__error').textContent = 'Please give a reason (at least 5 characters).'; ta.focus(); return; }
        resolve(ta.value.trim());
      } else resolve(true);
      m.dialog.removeEventListener('close', () => {});
      m.close();
    });
  });
}

// Runs an async action, reporting failures as a toast. Returns the result or undefined.
export async function attempt(fn, { success } = {}) {
  try { const r = await fn(); if (success) toast(success); return r; } catch (e) { toast(e.message || 'Something went wrong.', 'error'); return undefined; }
}

export function tabs(el, items, current, onChange) {
  el.setAttribute('role', 'tablist');
  el.classList.add('tabs');
  el.innerHTML = items.map(([id, text]) => `<button class="tab" type="button" role="tab" aria-selected="${id === current}" data-tab="${id}">${esc(text)}</button>`).join('');
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    onChange(b.dataset.tab);
  }));
}

export function table(columns, rows) {
  return `<div class="table-wrap"><table class="table"><thead><tr>${columns.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td data-label="${esc(c.label)}">${c.html ? c.html(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function timelineHtml(history) {
  if (!history?.length) return '';
  return `<ol class="timeline">${history.map((h) => `<li><span class="timeline__dot"></span><div><strong>${badge(h.toStatus)}</strong> <span class="timeline__who">${esc(h.actorName || 'System')} · ${esc(dt(h.createdAt))}</span>${h.note ? `<p>${esc(h.note)}</p>` : ''}</div></li>`).join('')}</ol>`;
}

// Delegated click handling: dispatch([selector, handler]...) on a container.
export function on(el, event, map) {
  el.addEventListener(event, (e) => {
    for (const [sel, fn] of Object.entries(map)) { const t = e.target.closest(sel); if (t && el.contains(t)) { fn(t, e); return; } }
  });
}
