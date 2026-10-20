import { renderNav, renderFooter, initReveal } from './layout.js';
import { SERVICES, SPACES } from './content.js';

function renderServices() {
  const el = document.querySelector('[data-services]');
  el.innerHTML = SERVICES.map((s, i) => `
    <a class="service reveal" href="${s.href}" style="transition-delay:${(i % 3) * 80}ms">
      ${s.icon}
      <span class="service__num">0${i + 1}</span>
      <h3>${s.title}</h3>
      <p>${s.text}</p>
      <span class="service__more">Explore</span>
    </a>`).join('');
}

function renderGallery() {
  const el = document.querySelector('[data-gallery]');
  el.innerHTML = SPACES.map((s) => `
    <a class="work reveal" href="${s.href}">
      <div class="work__media">
        <img class="gray-img" src="${s.src}" alt="${s.alt}" loading="lazy">
        <span class="work__view">View<br>Space</span>
      </div>
      <span class="work__cat">${s.cat}</span>
      <h3 class="work__title">${s.title}</h3>
      <div class="work__tags">${s.tags.map((t) => `<span>${t}</span>`).join('')}</div>
    </a>`).join('');
}

renderNav('/');
renderServices();
renderGallery();
renderFooter();
initReveal();
