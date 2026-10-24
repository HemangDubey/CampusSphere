// Small shared helpers for data-driven pages. All dynamic text goes through esc() before reaching innerHTML.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const label = (enumValue) => enumValue.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

export function notice(kind, message) {
  return `<div class="notice notice--${kind}" role="${kind === 'error' ? 'alert' : 'status'}"><span class="notice__icon" aria-hidden="true"></span><p>${esc(message)}</p></div>`;
}
export const loadingHtml = (text = 'Loading…') => `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span> ${esc(text)}</div>`;
export const emptyHtml = (title, text) => `<div class="empty-state"><p class="empty-state__title">${esc(title)}</p><p class="empty-state__text">${esc(text)}</p></div>`;

// Transient message region (toast-like) that screen readers announce.
export function toast(message, kind = 'success') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.remove(), 4500);
}

export function pagination(el, { page, totalPages }, onPage) {
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `<button class="button button--secondary button--sm" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
    <span class="pager__info">Page ${page} of ${totalPages}</span>
    <button class="button button--secondary button--sm" data-p="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next</button>`;
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => onPage(Number(b.dataset.p))));
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const DEMO_BADGE = '<span class="chip chip--demo">Demo data</span>';
