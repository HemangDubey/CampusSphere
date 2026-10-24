import { initShell } from './shell.js';

await initShell({ active: '/coursework', crumbs: [['Discover'], ['Coursework Demonstrations', '/coursework'], ['Keyboard events lab']] });

const input = document.getElementById('kb-input');
const fields = {};
document.querySelectorAll('[data-f]').forEach((el) => { fields[el.dataset.f] = el; });
const mods = [...document.querySelectorAll('[data-mod]')];
const legacy = document.querySelector('[data-legacy]');
const shortcut = document.querySelector('[data-shortcut]');
const LOCATIONS = ['standard', 'left', 'right', 'numpad'];
const NAMES = { ' ': '" " (Space)' };

// Listeners live on the practice box only (never on document or window) and are removed with an
// AbortController when the page is hidden, so nothing global is intercepted and nothing leaks.
const controller = new AbortController();
const { signal } = controller;

function readout(e) {
  fields.type.textContent = e.type;
  fields.key.textContent = NAMES[e.key] || e.key;
  fields.code.textContent = e.code || '(none)';
  fields.location.textContent = LOCATIONS[e.location] || String(e.location);
  fields.repeat.textContent = String(e.repeat);
  mods.forEach((m) => m.classList.toggle('is-on', e.getModifierState ? e.getModifierState(m.dataset.mod) : false));
}

input.addEventListener('keydown', (e) => {
  readout(e);
  // Small shortcut example, handled only inside this box. Ordinary typing and browser shortcuts are untouched.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const words = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
    shortcut.textContent = `Ctrl/Cmd + Enter detected: the box holds ${words} word${words === 1 ? '' : 's'}. (Nothing was sent anywhere.)`;
  }
}, { signal });
input.addEventListener('keyup', readout, { signal });
// keypress is deprecated: listened to here only to show whether it fires.
input.addEventListener('keypress', (e) => { legacy.textContent = `keypress: fired for "${e.key}" (deprecated, do not rely on it).`; }, { signal });

document.querySelector('[data-reset]').addEventListener('click', () => {
  input.value = '';
  Object.values(fields).forEach((el) => { el.textContent = el.dataset.f === 'type' ? 'none yet' : '–'; });
  mods.forEach((m) => m.classList.remove('is-on'));
  legacy.textContent = 'keypress: has not fired.';
  shortcut.textContent = 'Shortcut not used yet. Press Ctrl/Cmd + Enter inside the box.';
  input.focus();
}, { signal });

window.addEventListener('pagehide', () => controller.abort(), { once: true });
