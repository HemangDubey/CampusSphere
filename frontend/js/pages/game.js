import { initShell } from '../shell.js';
import { request } from '../api.js';
import { $, esc, pageHead, errorState, on, field, notice } from '../kit.js';
import { GAMES } from '../games/ui.js';
import { DIFFICULTIES } from '../games/logic.js';

const view = $('[data-view]');
const id = location.pathname.split('/').filter(Boolean)[1];
const user = await initShell({ active: '/games', crumbs: [['Discover'], ['Games & Recreation', '/games'], [GAMES[id]?.title || 'Game']] });
const def = GAMES[id];
if (!def) { view.innerHTML = errorState('That game does not exist.', false) + '<p><a class="auth__link" href="/games">&larr; All games</a></p>'; await new Promise(() => {}); }

let game = null;
let phase = 'idle';
let difficulty = 'normal';

view.innerHTML = `<p><a class="auth__link" href="/games">&larr; All games</a></p>${pageHead({ eyebrow: 'Games and recreation', title: def.title, lead: def.how })}
  <div class="split"><section class="card game-stage"><div class="row row--between"><div class="row">${field({ name: 'difficulty', label: 'Difficulty', type: 'select', options: DIFFICULTIES.map((d) => [d, d[0].toUpperCase() + d.slice(1)]), value: 'normal' })}</div>
      <div class="row"><button class="button" type="button" data-start>Start</button><button class="button button--secondary" type="button" data-pause hidden>Pause</button><button class="button button--secondary" type="button" data-restart hidden>Restart</button></div></div>
    <p class="game-hud" data-hud role="status" aria-live="polite">Choose a difficulty and press Start.</p><div class="game-area" data-area tabindex="-1"></div><div data-result aria-live="polite"></div></section>
    <aside class="stack-lg"><section class="card"><h2 class="section-title">Your best</h2><div data-bests>${user ? 'Loading…' : '<p class="small muted">Sign in to save your scores.</p>'}</div></section><section class="card"><h2 class="section-title">Leaderboard</h2><div data-board>Loading…</div></section></aside></div>`;
const area = $('[data-area]');
const hudEl = $('[data-hud]');
const startBtn = $('[data-start]');
const pauseBtn = $('[data-pause]');
const restartBtn = $('[data-restart]');
const diffSel = $('[name=difficulty]');

async function sideBoards() {
  try {
    const d = difficulty;
    const board = await request(`/games/leaderboard?game=${id}&difficulty=${d}`);
    $('[data-board]').innerHTML = board.entries.length
      ? `<ol class="list">${board.entries.map((e) => `<li${e.isYou ? ' style="font-weight:800"' : ''}><div class="row row--between"><span>${e.rank}. ${esc(e.name)}${e.isYou ? ' (you)' : ''}</span><strong>${e.score}</strong></div></li>`).join('')}</ol><p class="small muted">${esc(board.rule)}</p>`
      : '<p class="small muted">No scores yet for this difficulty. Be the first.</p>';
    if (user) {
      const mine = (await request('/games/scores/mine')).bests.filter((b) => b.game === id);
      $('[data-bests]').innerHTML = mine.length ? `<dl class="kv">${mine.map((b) => `<dt>${esc(b.difficulty)}</dt><dd><strong>${b.best}</strong> (${b.plays} play${b.plays === 1 ? '' : 's'})</dd>`).join('')}</dl>` : '<p class="small muted">No plays yet.</p>';
    }
  } catch (e) { $('[data-board]').innerHTML = errorState(e.message, false); }
}

async function finish({ score, meta }) {
  phase = 'done';
  pauseBtn.hidden = true;
  startBtn.hidden = true;
  restartBtn.hidden = false;
  restartBtn.textContent = 'Play again';
  const box = $('[data-result]');
  box.innerHTML = `${notice('success', `Finished! Score: ${score}`)}${user ? '<p class="small muted" data-saving>Saving your score…</p>' : '<p class="small">Sign in to save your score and appear on the leaderboard.</p>'}`;
  if (!user) return;
  try {
    const r = await request('/games/scores', { method: 'POST', body: { game: id, difficulty, score, meta } });
    $('[data-saving]').textContent = r.isNewBest ? `New personal best: ${r.personalBest}!` : `Saved. Your best on ${difficulty} is ${r.personalBest}.`;
    sideBoards();
  } catch (e) { $('[data-saving]').textContent = `Could not save the score: ${e.message}`; }
}

function begin() {
  game?.destroy();
  difficulty = diffSel.value;
  $('[data-result]').innerHTML = '';
  game = def.make(area, { difficulty, hud: (t) => { hudEl.textContent = t; }, finish });
  phase = 'playing';
  startBtn.hidden = true;
  restartBtn.hidden = false;
  restartBtn.textContent = 'Restart';
  pauseBtn.hidden = !game.canPause;
  pauseBtn.textContent = 'Pause';
  game.start();
  sideBoards();
}

on(view, 'click', {
  '[data-start]': begin,
  '[data-restart]': begin,
  '[data-pause]': () => {
    if (phase === 'playing') { game.pause(); phase = 'paused'; pauseBtn.textContent = 'Resume'; hudEl.textContent = 'Paused. Press Resume to continue.'; }
    else if (phase === 'paused') { game.resume(); phase = 'playing'; pauseBtn.textContent = 'Pause'; }
  },
  '[data-retry]': sideBoards
});
diffSel.addEventListener('change', () => { difficulty = diffSel.value; if (phase === 'playing' || phase === 'paused') { if (!confirm('Changing difficulty restarts the game. Continue?')) { diffSel.value = difficulty; return; } begin(); } else { phase = 'idle'; game?.destroy(); game = null; area.innerHTML = ''; $('[data-result]').innerHTML = ''; startBtn.hidden = false; restartBtn.hidden = true; pauseBtn.hidden = true; hudEl.textContent = 'Press Start.'; sideBoards(); } });
window.addEventListener('pagehide', () => game?.destroy());

sideBoards();
