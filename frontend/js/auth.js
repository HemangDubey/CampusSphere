// Drives the login, register, forgot-password and reset-password pages.
// All calls go through the API layer; success is only ever shown when the server confirms it.
import { renderNav, renderFooter, initReveal } from './layout.js';
import { enhanceForm } from './forms.js';
import { authApi } from './api.js';

const page = document.body.dataset.authPage;
renderNav('/login');
renderFooter();
initReveal();

const form = document.querySelector('[data-auth-form]');
const errorBox = document.querySelector('[data-form-notice]');
const successBox = document.querySelector('[data-form-success]');

function show(box, message) {
  errorBox.hidden = true;
  successBox.hidden = true;
  if (!box) return;
  box.querySelector('p').textContent = message;
  box.hidden = false;
}

document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
  const input = document.getElementById(btn.dataset.togglePassword);
  btn.addEventListener('click', () => {
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    btn.textContent = reveal ? 'Hide' : 'Show';
    btn.setAttribute('aria-pressed', String(reveal));
    btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
  });
});

const token = new URLSearchParams(location.search).get('token');
const tokenInput = document.querySelector('[data-reset-token]');
if (page === 'reset') {
  if (tokenInput) tokenInput.value = token || '';
  if (!token) show(errorBox, 'This reset link is missing its token. Request a new link from the forgot password page.');
}

const handlers = {
  login: async (d) => {
    await authApi.login({ email: d.email.trim(), password: d.password });
    const next = new URLSearchParams(location.search).get('next');
    location.assign(next && /^\/(?![/\\])/.test(next) ? next : '/dashboard');
  },
  register: async (d) => {
    await authApi.register({ name: d.name.trim(), email: d.email.trim(), password: d.password, confirmPassword: d.confirmPassword });
    show(successBox, 'Account created. Taking you to your dashboard…');
    setTimeout(() => location.assign('/dashboard'), 800);
  },
  forgot: async (d) => {
    await authApi.forgotPassword({ email: d.email.trim() });
    show(successBox, 'If an account exists for that email, a reset has been prepared. Email delivery is not configured in this project yet, so no message is sent; ask your administrator for the reset link.');
  },
  reset: async (d) => {
    if (!d.token) { show(errorBox, 'This reset link is missing its token.'); return; }
    await authApi.resetPassword({ token: d.token, password: d.password, confirmPassword: d.confirmPassword });
    show(successBox, 'Password updated. You can now sign in.');
    setTimeout(() => location.assign('/login'), 1200);
  }
};

if (form && handlers[page]) {
  enhanceForm(form, {
    onSubmit: async (data) => {
      show(null);
      try { await handlers[page](data); }
      catch (e) {
        const first = e.details && Object.values(e.details)[0];
        show(errorBox, first && e.status === 400 ? first : e.message);
      }
    }
  });
}
