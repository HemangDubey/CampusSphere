import { renderNav, renderFooter, initReveal } from '/js/layout.js';

renderNav('/pages/bootstrap-demo.html');
renderFooter();
initReveal();
// Bootstrap's documented validation pattern.
const form = document.querySelector('[data-bs-form]');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  form.classList.add('was-validated');
});
