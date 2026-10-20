// Placeholder shell for planned module routes (/login, /dashboard, /events, ...).
// Each module will replace this with its own page when implemented.
import { renderNav, renderFooter, initReveal } from './layout.js';

const slug = location.pathname.replace(/^\/+|\/+$/g, '');
renderNav('/' + slug);
renderFooter();
initReveal();

const title = document.querySelector('[data-title]');
const blurb = document.querySelector('[data-blurb]');

fetch('/api/modules')
  .then((r) => r.json())
  .then(({ modules }) => {
    const mod = modules.find((m) => m.slug === slug);
    if (!mod) return;
    document.title = `${mod.title} | CampusSphere`;
    const [first, ...rest] = mod.title.split(' ');
    title.innerHTML = rest.length ? `${first}<br><em>${rest.join(' ')}</em>` : mod.title;
    blurb.textContent = `${mod.blurb} This module is being built and will be available here soon.`;
  })
  .catch(() => { title.textContent = 'Coming soon'; });
