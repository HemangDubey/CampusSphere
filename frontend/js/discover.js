// Discovery strips shared by Campus Resources and the Library: featured, newest, most saved and recently viewed.
// Everything comes from GET /resources/home, which only reports real data (featured is set by administrators,
// "most saved" is a real bookmark count, "recently viewed" is the signed-in user's own history).
import { request } from './api.js';
import { esc, label, cover } from './kit.js';

const SECTIONS = [
  ['featured', 'Featured', 'Chosen by campus administrators'],
  ['recentlyViewed', 'Recently viewed', 'Pick up where you left off'],
  ['popular', 'Most saved', 'Saved by the most students'],
  ['recent', 'Recently added', 'The newest entries']
];

const mini = (r) => `<a class="card card--flush card--link mini" href="/resources/${r.id}">${cover(r.imageUrl, r.title, r.kind, 'cover--thumb')}<div class="card__body"><span class="badge badge--muted">${esc(r.category?.name || label(r.kind))}</span><h3>${esc(r.title)}</h3>${r.author ? `<p class="small muted">${esc(r.author)}</p>` : ''}</div></a>`;

export async function renderDiscovery(box, { kind } = {}) {
  try {
    const data = await request(`/resources/home${kind ? `?kind=${kind}` : ''}`);
    const html = SECTIONS.filter(([k]) => data[k]?.length).map(([k, title, hint]) => `<section class="discover"><div class="discover__head"><h2 class="section-title">${esc(title)}</h2><p class="small muted">${esc(hint)}</p></div><div class="grid grid--cards">${data[k].slice(0, 3).map(mini).join('')}</div></section>`).join('');
    box.innerHTML = html;
    box.hidden = !html;
  } catch {
    box.innerHTML = '';
    box.hidden = true; // discovery is a bonus; the catalogue below still works
  }
}
