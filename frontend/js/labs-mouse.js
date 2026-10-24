import { initShell } from './shell.js';

await initShell({ active: '/coursework', crumbs: [['Discover'], ['Coursework', '/coursework'], ['Mouse events lab']] });

// Real events carry a pointer position; simulated (keyboard-triggered) ones do not, so no coordinates are shown.
const pos = (e) => (e.isTrusted ? ` at ${Math.round(e.offsetX)}, ${Math.round(e.offsetY)}` : '');
const BUTTONS = ['left', 'middle', 'right', 'back', 'forward'];

// One entry per demo. info() turns the real event into the short "latest event" line.
const DEMOS = [
  { type: 'click', title: 'click', how: 'Press and release the primary button on the same element. Also fires for Enter or Space on a focused button.',
    info: (e) => `button: ${BUTTONS[e.button] || e.button}${pos(e)}` },
  { type: 'dblclick', title: 'dblclick', how: 'Click twice quickly on the same element. Keyboards have no equivalent, so use the button to see a simulated one.',
    info: (e) => `double click${pos(e)}` },
  { type: 'mousedown', title: 'mousedown', how: 'Fires the moment a mouse button goes down, before it is released.', info: (e) => `${BUTTONS[e.button] || e.button} button pressed` },
  { type: 'mouseup', title: 'mouseup', how: 'Fires when the button is released over the element.', info: (e) => `${BUTTONS[e.button] || e.button} button released` },
  { type: 'mouseenter', title: 'mouseenter', how: 'Fires once when the pointer moves onto the element. It does not bubble.', info: () => 'pointer entered' },
  { type: 'mouseleave', title: 'mouseleave', how: 'Fires once when the pointer moves off the element. It does not bubble.', info: () => 'pointer left' },
  { type: 'mouseover', title: 'mouseover', how: 'Fires when the pointer moves onto the element or one of its children. It bubbles.', info: (e) => `entered ${e.target.dataset.part || 'zone'}` },
  { type: 'mouseout', title: 'mouseout', how: 'Fires when the pointer moves off the element or onto one of its children. It bubbles.', info: (e) => `left ${e.target.dataset.part || 'zone'}` },
  { type: 'mousemove', title: 'mousemove', how: 'Fires repeatedly while the pointer moves. Only the latest position is shown to keep the page calm.', info: (e) => (e.isTrusted ? `x ${Math.round(e.offsetX)}, y ${Math.round(e.offsetY)}` : 'pointer moved'), throttle: true },
  { type: 'contextmenu', title: 'contextmenu', how: 'Right-click (or the context-menu key). The browser menu is blocked inside this zone only, so you can see the event.', info: (e) => `context menu requested${pos(e)}`, prevent: true }
];

const host = document.querySelector('[data-demos]');
host.innerHTML = DEMOS.map((d) => `
  <article class="lab-card" data-demo="${d.type}">
    <h2 class="lab-card__title"><code>${d.title}</code></h2>
    <p class="lab-card__how">${d.how}</p>
    <div class="zone" tabindex="0" role="button" aria-label="${d.title} demo zone" data-zone><span data-part="zone">Interact here</span></div>
    <p class="lab-card__out"><strong>Latest:</strong> <span data-out aria-live="off">nothing yet</span></p>
    <p class="lab-card__count"><strong>Count:</strong> <span data-count>0</span></p>
    <div class="lab-card__actions">
      <button class="button button--secondary button--sm" type="button" data-sim>Trigger with keyboard (simulated)</button>
      <button class="button button--ghost button--sm" type="button" data-reset>Reset</button>
    </div>
  </article>`).join('');

DEMOS.forEach((d) => {
  const card = host.querySelector(`[data-demo="${d.type}"]`);
  const zone = card.querySelector('[data-zone]');
  const out = card.querySelector('[data-out]');
  const countEl = card.querySelector('[data-count]');
  let count = 0;
  let flashTimer;
  let frame = 0;
  let last = null;

  const show = (e, simulated) => {
    count += 1;
    countEl.textContent = String(count);
    out.textContent = `${d.info(e)}${simulated ? ' (simulated)' : ''}`;
    zone.classList.add('is-active');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => zone.classList.remove('is-active'), 350);
  };

  zone.addEventListener(d.type, (e) => {
    if (d.prevent) e.preventDefault(); // only inside this demo zone
    if (d.throttle) {
      last = e;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; show(last, !last.isTrusted); });
      return;
    }
    show(e, !e.isTrusted);
  });

  // Keyboards cannot produce most mouse events, so dispatch a synthetic one and label it as simulated.
  card.querySelector('[data-sim]').addEventListener('click', () => {
    zone.dispatchEvent(new MouseEvent(d.type, { bubbles: true, cancelable: true, button: d.type === 'contextmenu' ? 2 : 0, clientX: 0, clientY: 0 }));
    zone.focus();
  });
  card.querySelector('[data-reset]').addEventListener('click', () => {
    count = 0;
    countEl.textContent = '0';
    out.textContent = 'nothing yet';
    zone.classList.remove('is-active');
  });
  // Enter/Space on the focused zone behaves like a click for keyboard users.
  zone.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && d.type === 'click') { e.preventDefault(); zone.click(); }
  });
});

// mouseenter/mouseleave vs mouseover/mouseout on nested elements
const outer = document.querySelector('[data-outer]');
const counts = {};
document.querySelectorAll('[data-c]').forEach((el) => { counts[el.dataset.c] = { el, n: 0 }; });
['mouseenter', 'mouseover', 'mouseleave', 'mouseout'].forEach((type) => {
  outer.addEventListener(type, () => { counts[type].n += 1; counts[type].el.textContent = String(counts[type].n); });
});
document.querySelector('[data-reset-compare]').addEventListener('click', () => {
  Object.values(counts).forEach((c) => { c.n = 0; c.el.textContent = '0'; });
});
