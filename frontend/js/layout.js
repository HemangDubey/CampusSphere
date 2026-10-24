// Shared site chrome (nav + footer) so every page and future module stays consistent.
import { authApi } from './api.js';

export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/#modules', label: 'Modules' },
  { href: '/events', label: 'Events' },
  { href: '/travel', label: 'Travel' },
  { href: '/resources', label: 'Resources' },
  { href: '/healthcare', label: 'Healthcare' },
  { href: '/games', label: 'Games' },
  { href: '/assistant', label: 'AI Assistant' }
];

const arrow = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
export { arrow };

export function renderNav(activePath = '/') {
  const el = document.querySelector('[data-nav]');
  if (!el) return;
  el.innerHTML = `
    <div class="container nav__inner">
      <a class="brand" href="/" aria-label="CampusSphere home">CampusSphere</a>
      <ul class="nav__menu" id="nav-menu">
        ${NAV_LINKS.map((l) => `<li><a href="${l.href}"${l.href === activePath ? ' class="is-active" aria-current="page"' : ''}>${l.label}</a></li>`).join('')}
      </ul>
      <div class="nav__actions">
        <a class="btn-pill" href="/login">Get Started</a>
        <button class="nav__toggle" aria-label="Toggle menu" aria-expanded="false" aria-controls="nav-menu"><span></span><span></span><span></span></button>
      </div>
    </div>`;
  // Swap "Get Started" for "Dashboard" when a session exists (the server decides; failures are ignored).
  authApi.me().then(() => {
    const cta = el.querySelector('.nav__actions .btn-pill');
    if (cta) { cta.textContent = 'Dashboard'; cta.href = '/dashboard'; }
  }).catch(() => {});
  const toggle = el.querySelector('.nav__toggle');
  toggle.addEventListener('click', () => {
    const open = el.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  el.querySelectorAll('.nav__menu a').forEach((a) => a.addEventListener('click', () => {
    el.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
}

export function renderFooter() {
  const el = document.querySelector('[data-footer]');
  if (!el) return;
  const year = new Date().getFullYear();
  el.innerHTML = `
    <div class="container">
      <div class="footer__grid">
        <div class="footer__brand reveal">
          <a class="brand" href="/"><span class="brand__dot"></span>CampusSphere</a>
          <p>Your smart campus companion. One calm, beautifully simple place for everything that makes student life work: classes, services, events, labs and answers.</p>
          <form class="subscribe" data-subscribe novalidate>
            <input id="sub-email" aria-label="Campus email" type="email" name="email" placeholder="Your campus email" autocomplete="email" required>
            <button type="submit">Subscribe</button>
          </form>
          <p class="form-msg" data-subscribe-msg role="status"></p>
        </div>
        <div class="footer__cols reveal">
          <div><h4>Explore</h4><ul>
            <li><a href="/dashboard">Dashboard</a></li><li><a href="/resources">Campus Resources</a></li>
            <li><a href="/events">Events</a></li><li><a href="/travel">Travel Explorer</a></li><li><a href="/healthcare">Healthcare</a></li><li><a href="/leave">Leave &amp; Approvals</a></li><li><a href="/games">Games &amp; Recreation</a></li><li><a href="/coursework">Coursework</a></li>
            <li><a href="/assistant">AI Assistant</a></li></ul></div>
          <div><h4>Connect</h4><ul>
            <li><a href="/about">About</a></li><li><a href="/contact">Contact</a></li>
            <li><a href="/login">Student Login</a></li><li><a href="/#top">Back to top</a></li></ul></div>
          <div><h4>Campus</h4><address>A student project.<br>Check opening hours and contacts<br>with your institution.</address></div>
        </div>
      </div>
      <div class="footer__bar">
        <span>&copy; ${year} CampusSphere. All rights reserved.</span>
        <nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Support</a></nav>
      </div>
    </div>`;

  const form = el.querySelector('[data-subscribe]');
  const msg = el.querySelector('[data-subscribe-msg]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.classList.remove('is-error');
    msg.textContent = 'Subscribing…';
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.value.trim() })
      });
      const data = await res.json();
      msg.textContent = data.message || data.error?.message || 'Something went wrong.';
      msg.classList.toggle('is-error', !res.ok);
      if (res.ok) form.reset();
    } catch {
      msg.textContent = 'Could not reach the server. Please try again.';
      msg.classList.add('is-error');
    }
  });
}

// Reveal-up: IntersectionObserver at 0.15 threshold.
export function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) { items.forEach((i) => i.classList.add('is-visible')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    });
  }, { threshold: 0.15 });
  items.forEach((i) => io.observe(i));
}
