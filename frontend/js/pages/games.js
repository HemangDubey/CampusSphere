import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, pageHead } from '../kit.js';
import { GAMES } from '../games/ui.js';

const view = $('[data-view]');
const user = await initShell({ active: '/games', crumbs: [['Discover'], ['Games & Recreation']] });
let bests = {};
if (user) { try { (await request('/games/scores/mine')).bests.forEach((b) => { if (b.difficulty === 'normal' || !bests[b.game] || b.best > bests[b.game]) bests[b.game] = b.best; }); } catch { /* bests are optional */ } }

view.innerHTML = `${pageHead({ eyebrow: 'Discover', title: 'Games and recreation', lead: 'Take a break between classes. Six quick games you play with the mouse and keyboard. Sign in to keep your personal bests.' })}
  <div class="grid grid--cards">${Object.entries(GAMES).map(([id, g]) => `<a class="card card--link game-card" href="/games/${id}"><span class="game-card__art game-card__art--${id}" aria-hidden="true"></span><h3>${esc(g.title)}</h3><p>${esc(g.blurb)}</p><div class="row row--between"><span class="small muted">${bests[id] != null ? `Your best: <strong>${bests[id]}</strong>` : user ? 'Not played yet' : 'Sign in to save scores'}</span><span class="button button--sm">Play</span></div></a>`).join('')}</div>
  <p class="small muted" style="margin-top:20px">Scores are reported by your browser, so leaderboards are for fun only. Looking for the original coursework pages? See <a class="auth__link" href="/coursework">Coursework</a>.</p>`;
