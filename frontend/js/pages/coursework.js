import { initShell } from '../shell.js';
import { $, esc, pageHead, notice } from '../kit.js';

const view = $('[data-view]');
await initShell({ active: '/coursework', crumbs: [['Discover'], ['Coursework']] });

const DEMOS = [
  ['/labs/mouse', 'Mouse events lab', 'click, dblclick, mousedown, mouseup, mouseenter/leave vs mouseover/out, mousemove and contextmenu, each with a live demonstration.', 'JavaScript mouse events'],
  ['/labs/keyboard', 'Keyboard events lab', 'keydown, keyup, the deprecated keypress, key and code, modifier keys and a scoped Ctrl/Cmd + Enter shortcut.', 'JavaScript keyboard events'],
  ['/pages/bootstrap-demo.html', 'Bootstrap demo', 'Grid, form validation, table, badges and modal with a local copy of Bootstrap 5.3.3 (no CDN).', 'Bootstrap'],
  ['/checkout', 'Checkout', 'Order summary, calculations, billing form, payment method and result screens.', 'Forms, calculations, validation'],
  ['/courses', 'Course registration form', 'Select, radio buttons, textarea and checkbox with inline validation, saved to the database.', 'HTML5 forms and validation'],
  ['/employees', 'Employee records', 'Employee profile cards and registration form (administrators only).', 'Forms, CRUD, authorization'],
  ['/games', 'Games and recreation', 'Six mini-games built with mouse and keyboard event handling.', 'JavaScript events in practice']
];

view.innerHTML = `${pageHead({ eyebrow: 'Academic evidence', title: 'Coursework', lead: 'Pages that show specific front-end concepts, kept separate from the main student experience for review.' })}
  <div class="grid grid--cards">${DEMOS.map(([href, title, text, concept]) => `<a class="card card--link" href="${href}"><span class="badge badge--muted">${esc(concept)}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></a>`).join('')}</div>
  <section class="card" style="margin-top:20px"><h2 class="section-title">Questions Q01 to Q41</h2>${notice('warning', 'Pending: the original wording of the 41 coursework questions is not available in this project, so the standalone HTML pages (no-CSS pages, div-only and table layouts, required tags) have not been built and no question is marked complete. See COURSEWORK_COVERAGE.md.')}</section>`;
