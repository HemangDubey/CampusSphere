// Playable game screens. Each factory receives a container and { difficulty, hud(text), finish({ score, meta }) } and
// returns { start, pause, resume, destroy, canPause }. Event handling uses real mouse and keyboard events;
// listeners are removed by destroy() (an AbortController per game), so nothing leaks between games.
import { esc } from '../ui.js';
import * as L from './logic.js';

class Clock {
  constructor(onTick) { this.ms = 0; this.last = 0; this.timer = null; this.onTick = onTick; }
  start() { this.ms = 0; this.resume(); }
  resume() { this.last = performance.now(); clearInterval(this.timer); this.timer = setInterval(() => { const n = performance.now(); this.ms += n - this.last; this.last = n; this.onTick?.(this.seconds); }, 200); }
  pause() { if (this.timer) { const n = performance.now(); this.ms += n - this.last; clearInterval(this.timer); this.timer = null; } }
  stop() { this.pause(); return this.seconds; }
  get seconds() { return Math.round(this.ms / 1000); }
}

// ---------------------------------------------------------------- Memory Match
function memory(root, { difficulty, hud, finish }) {
  const { pairs, cols } = L.MEMORY[difficulty];
  const ac = new AbortController();
  let deck = [];
  let open = [];
  let matched = 0;
  let moves = 0;
  let lock = false;
  let paused = false;
  const clock = new Clock((s) => draw(s));
  const draw = (s = clock.seconds) => hud(`Moves ${moves} · Pairs ${matched}/${pairs} · Time ${s}s`);
  function render() {
    root.innerHTML = `<div class="memory" style="grid-template-columns:repeat(${cols},minmax(0,1fr))" role="group" aria-label="Memory cards">${deck.map((c, i) => `<button class="memory__card" type="button" data-i="${i}" aria-label="Card ${i + 1}, face down"><span class="memory__face" aria-hidden="true"></span></button>`).join('')}</div>`;
  }
  const show = (i, up) => {
    const b = root.querySelector(`[data-i="${i}"]`);
    b.classList.toggle('is-up', up);
    b.querySelector('.memory__face').textContent = up ? deck[i].symbol : '';
    b.setAttribute('aria-label', up ? `Card ${i + 1}, ${deck[i].symbol}` : `Card ${i + 1}, face down`);
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b || lock || paused) return;
    const i = Number(b.dataset.i);
    if (open.includes(i) || b.classList.contains('is-matched')) return;
    show(i, true);
    open.push(i);
    if (open.length < 2) return;
    moves += 1;
    const [x, y] = open;
    if (deck[x].pair === deck[y].pair) {
      [x, y].forEach((k) => root.querySelector(`[data-i="${k}"]`).classList.add('is-matched'));
      matched += 1;
      open = [];
      draw();
      if (matched === pairs) { const seconds = clock.stop(); finish({ score: L.memoryScore({ pairs, moves, seconds }), meta: { moves, seconds, pairs } }); }
    } else {
      lock = true;
      draw();
      setTimeout(() => { show(x, false); show(y, false); open = []; lock = false; }, 800);
    }
  }, { signal: ac.signal });
  return {
    canPause: true,
    start() { deck = L.memoryDeck(difficulty); open = []; matched = 0; moves = 0; lock = false; paused = false; render(); clock.start(); draw(0); root.querySelector('.memory__card')?.focus(); },
    pause() { paused = true; clock.pause(); root.classList.add('is-paused'); },
    resume() { paused = false; clock.resume(); root.classList.remove('is-paused'); },
    destroy() { clock.stop(); ac.abort(); root.classList.remove('is-paused'); }
  };
}

// ---------------------------------------------------------------- Reaction Time
function reaction(root, { difficulty, hud, finish }) {
  const ac = new AbortController();
  const { rounds } = L.REACTION[difficulty];
  let times = [];
  let falseStarts = 0;
  let state = 'idle';
  let timer = null;
  let t0 = 0;
  const pad = document.createElement('button');
  pad.type = 'button';
  pad.className = 'reaction';
  root.replaceChildren(pad);
  const label = (text, cls) => { pad.className = `reaction ${cls}`; pad.textContent = text; };
  const draw = () => hud(`Round ${Math.min(times.length + 1, rounds)}/${rounds} · Best ${times.length ? Math.min(...times) : '–'} ms`);
  function arm() {
    state = 'waiting';
    label('Wait for green…', 'is-wait');
    timer = setTimeout(() => { state = 'go'; t0 = performance.now(); label('NOW! Click or press Space', 'is-go'); }, L.reactionDelay(difficulty));
  }
  function press() {
    if (state === 'waiting') { clearTimeout(timer); falseStarts += 1; label('Too early! Click to retry this round', 'is-early'); state = 'early'; return; }
    if (state === 'early') { arm(); return; }
    if (state === 'go') {
      const ms = Math.round(performance.now() - t0);
      times.push(ms);
      draw();
      if (times.length >= rounds) { state = 'done'; label(`${ms} ms. Finished!`, 'is-done'); finish({ score: L.reactionScore(times, falseStarts), meta: { avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length), falseStarts } }); return; }
      state = 'between';
      label(`${ms} ms. Click for the next round`, 'is-done');
      return;
    }
    if (state === 'between') arm();
  }
  pad.addEventListener('mousedown', (e) => { e.preventDefault(); press(); }, { signal: ac.signal });
  pad.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) press(); } }, { signal: ac.signal });
  return {
    canPause: false,
    start() { times = []; falseStarts = 0; clearTimeout(timer); draw(); pad.focus(); arm(); },
    pause() {}, resume() {},
    destroy() { clearTimeout(timer); ac.abort(); }
  };
}

// ---------------------------------------------------------------- Keyboard Speed
function typing(root, { difficulty, hud, finish }) {
  const ac = new AbortController();
  const limit = L.TYPING[difficulty];
  let target = '';
  let started = false;
  let done = false;
  let t0 = 0;
  let timer = null;
  root.innerHTML = '<p class="typing__target" data-target aria-live="off"></p><label class="field__label" for="typing-input">Type the text above</label><textarea class="textarea typing__input" id="typing-input" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>';
  const targetEl = root.querySelector('[data-target]');
  const input = root.querySelector('textarea');
  const paint = () => {
    const v = input.value;
    targetEl.innerHTML = [...target].map((ch, i) => `<span class="${i < v.length ? (v[i] === ch ? 'ok' : 'bad') : i === v.length ? 'cur' : ''}">${esc(ch)}</span>`).join('');
  };
  const left = () => Math.max(0, limit - Math.round((performance.now() - t0) / 1000));
  function end() {
    if (done) return;
    done = true;
    clearInterval(timer);
    input.disabled = true;
    const elapsed = Math.max(1, Math.min(limit, (performance.now() - t0) / 1000));
    const stats = L.typingStats(target, input.value, elapsed);
    finish({ score: L.typingScore(stats), meta: { wpm: Math.round(stats.wpm), accuracy: Math.round(stats.accuracy * 100) } });
  }
  input.addEventListener('input', () => {
    if (done) return;
    if (!started) { started = true; t0 = performance.now(); timer = setInterval(() => { hud(`Time left ${left()}s`); if (left() <= 0) end(); }, 250); }
    paint();
    if (input.value.length >= target.length) {
      // Finished the sentence: load another so the player keeps going until time runs out.
      target += ` ${L.shuffle(L.SENTENCES)[0]}`;
      paint();
    }
  }, { signal: ac.signal });
  return {
    canPause: false,
    start() { target = L.shuffle(L.SENTENCES)[0]; started = false; done = false; clearInterval(timer); input.disabled = false; input.value = ''; paint(); hud(`Start typing: you have ${limit}s`); input.focus(); },
    pause() {}, resume() {},
    destroy() { clearInterval(timer); ac.abort(); }
  };
}

// ---------------------------------------------------------------- Pattern Recall
function pattern(root, { difficulty, hud, finish }) {
  const ac = new AbortController();
  const { speed } = L.PATTERN[difficulty];
  const COLORS = ['Teal', 'Pink', 'Blue', 'Sand'];
  let seq = [];
  let input = [];
  let phase = 'idle';
  let timers = [];
  root.innerHTML = `<div class="pattern" role="group" aria-label="Pattern pads">${COLORS.map((c, i) => `<button class="pattern__pad pattern__pad--${i}" type="button" data-pad="${i}" aria-label="${c} pad, key ${i + 1}">${i + 1}</button>`).join('')}</div><p class="muted small" data-msg>Watch the lights, then repeat the pattern with the mouse or keys 1 to 4.</p>`;
  const msg = root.querySelector('[data-msg]');
  const flash = (i) => { const b = root.querySelector(`[data-pad="${i}"]`); b.classList.add('is-lit'); timers.push(setTimeout(() => b.classList.remove('is-lit'), speed * 0.7)); };
  const draw = () => hud(`Level ${Math.max(seq.length, 1)} · Completed ${Math.max(0, seq.length - 1)}`);
  function play() {
    phase = 'show';
    input = [];
    seq = L.nextPattern(seq);
    draw();
    msg.textContent = 'Watch…';
    seq.forEach((n, k) => timers.push(setTimeout(() => flash(n), 600 + k * speed)));
    timers.push(setTimeout(() => { phase = 'input'; msg.textContent = 'Your turn.'; }, 600 + seq.length * speed));
  }
  function press(i) {
    if (phase !== 'input') return;
    flash(i);
    input.push(i);
    const r = L.checkPattern(seq, input);
    if (r === 'wrong') { phase = 'over'; const done = seq.length - 1; msg.textContent = `Not quite. You completed ${done} level${done === 1 ? '' : 's'}.`; finish({ score: L.patternScore(done), meta: { levels: done } }); }
    else if (r === 'complete') { phase = 'between'; msg.textContent = 'Correct!'; timers.push(setTimeout(play, 700)); }
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-pad]'); if (b) press(Number(b.dataset.pad)); }, { signal: ac.signal });
  document.addEventListener('keydown', (e) => { if (/^[1-4]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && root.isConnected && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) press(Number(e.key) - 1); }, { signal: ac.signal });
  return {
    canPause: false,
    start() { timers.forEach(clearTimeout); timers = []; seq = []; input = []; play(); },
    pause() {}, resume() {},
    destroy() { timers.forEach(clearTimeout); ac.abort(); }
  };
}

// ---------------------------------------------------------------- Campus Trivia (study edition)
function trivia(root, { difficulty, hud, finish }) {
  const ac = new AbortController();
  const { seconds } = L.TRIVIA[difficulty];
  let qs = [];
  let i = 0;
  let points = 0;
  let correct = 0;
  let left = seconds;
  let timer = null;
  let paused = false;
  let answered = false;
  const draw = () => hud(`Question ${i + 1}/${qs.length} · Points ${points} · ${left}s left`);
  function ask() {
    answered = false;
    left = seconds;
    const q = qs[i];
    root.innerHTML = `<div class="trivia"><h3 class="trivia__q">${esc(q.q)}</h3><div class="trivia__opts" role="group" aria-label="Answers">${q.a.map((a, n) => `<button class="button button--secondary trivia__opt" type="button" data-n="${n}"><kbd>${n + 1}</kbd> ${esc(a)}</button>`).join('')}</div><p class="muted small" data-fb role="status"></p></div>`;
    draw();
    clearInterval(timer);
    timer = setInterval(() => { if (paused) return; left -= 1; draw(); if (left <= 0) answer(-1); }, 1000);
  }
  function answer(n) {
    if (answered || paused) return;
    answered = true;
    clearInterval(timer);
    const q = qs[i];
    const ok = n === q.c;
    if (ok) { correct += 1; points += L.triviaPoints(true, left, seconds); }
    root.querySelectorAll('.trivia__opt').forEach((b, k) => { b.disabled = true; if (k === q.c) b.classList.add('is-right'); else if (k === n) b.classList.add('is-wrong'); });
    root.querySelector('[data-fb]').textContent = n === -1 ? `Time is up. The answer was "${q.a[q.c]}".` : ok ? 'Correct!' : `Not quite. The answer was "${q.a[q.c]}".`;
    draw();
    setTimeout(() => { i += 1; if (i >= qs.length) { root.innerHTML = '<p class="trivia__q">All questions answered.</p>'; finish({ score: L.triviaScore(points), meta: { correct, total: qs.length } }); } else ask(); }, 1200);
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) answer(Number(b.dataset.n)); }, { signal: ac.signal });
  document.addEventListener('keydown', (e) => { if (/^[1-4]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && root.isConnected && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) answer(Number(e.key) - 1); }, { signal: ac.signal });
  return {
    canPause: true,
    start() { qs = L.triviaQuestions(difficulty); i = 0; points = 0; correct = 0; paused = false; ask(); },
    pause() { paused = true; root.classList.add('is-paused'); },
    resume() { paused = false; root.classList.remove('is-paused'); },
    destroy() { clearInterval(timer); ac.abort(); }
  };
}

// ---------------------------------------------------------------- Maze Runner
function maze(root, { difficulty, hud, finish }) {
  const ac = new AbortController();
  const n = L.MAZE[difficulty];
  let m;
  let pos;
  let steps = 0;
  let optimal = 0;
  let paused = false;
  let over = false;
  const clock = new Clock((s) => draw(s));
  const draw = (s = clock.seconds) => hud(`Steps ${steps} · Shortest possible ${optimal} · Time ${s}s`);
  function render() {
    const cells = m.cells.map((c, idx) => {
      const x = idx % n; const y = Math.floor(idx / n);
      const cls = ['maze__cell', c.n && 'wn', c.e && 'we', c.s && 'ws', c.w && 'ww', x === pos.x && y === pos.y && 'me', x === n - 1 && y === n - 1 && 'goal'].filter(Boolean).join(' ');
      return `<div class="${cls}" ${x === pos.x && y === pos.y ? 'aria-label="You are here"' : ''}></div>`;
    }).join('');
    root.innerHTML = `<div class="maze" style="grid-template-columns:repeat(${n},1fr)" role="img" aria-label="Maze. Use the arrow keys or WASD to reach the bottom-right square.">${cells}</div>
      <div class="dpad" role="group" aria-label="On-screen controls"><button class="button button--secondary button--sm" type="button" data-k="ArrowUp" aria-label="Up">↑</button><div><button class="button button--secondary button--sm" type="button" data-k="ArrowLeft" aria-label="Left">←</button><button class="button button--secondary button--sm" type="button" data-k="ArrowDown" aria-label="Down">↓</button><button class="button button--secondary button--sm" type="button" data-k="ArrowRight" aria-label="Right">→</button></div></div>`;
  }
  function go(key) {
    if (over || paused) return;
    const next = L.move(m, pos, key);
    if (next === pos) return;
    pos = next;
    steps += 1;
    render();
    draw();
    if (pos.x === n - 1 && pos.y === n - 1) { over = true; const seconds = clock.stop(); finish({ score: L.mazeScore({ optimal, steps, seconds }), meta: { steps, optimal, seconds } }); }
  }
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || !root.isConnected) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (L.DIR[k]) { e.preventDefault(); go(k); } // only game keys are intercepted, and only while a maze is on screen
  }, { signal: ac.signal });
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) go(b.dataset.k); }, { signal: ac.signal });
  return {
    canPause: true,
    start() { m = L.makeMaze(n); optimal = L.shortestPath(m); pos = { x: 0, y: 0 }; steps = 0; over = false; paused = false; render(); clock.start(); draw(0); },
    pause() { paused = true; clock.pause(); root.classList.add('is-paused'); },
    resume() { paused = false; clock.resume(); root.classList.remove('is-paused'); },
    destroy() { clock.stop(); ac.abort(); }
  };
}

export const GAMES = {
  memory: { title: 'Memory Match', blurb: 'Flip cards and find every pair in as few moves as you can.', how: 'Click or press Enter/Space on a card to flip it. Match all pairs. Fewer moves and less time score higher.', make: memory },
  reaction: { title: 'Reaction Time', blurb: 'Wait for green, then react as fast as you can.', how: 'Click the pad or press Space the moment it turns green. Reacting early counts against you.', make: reaction },
  typing: { title: 'Keyboard Speed', blurb: 'Type the text accurately before time runs out.', how: 'Start typing to start the clock. Accuracy matters as much as speed.', make: typing },
  pattern: { title: 'Pattern Recall', blurb: 'Watch the lights, then repeat the growing pattern.', how: 'Repeat the sequence with the mouse or the number keys 1 to 4. Each level adds one step.', make: pattern },
  trivia: { title: 'Campus Trivia', blurb: 'Quick study-edition questions on web basics and computing.', how: 'Answer with a click or the keys 1 to 4 before the timer runs out. Faster answers earn a bonus.', make: trivia },
  maze: { title: 'Maze Runner', blurb: 'Find your way to the exit by the shortest route you can.', how: 'Use the arrow keys, WASD or the on-screen buttons to reach the bottom-right square.', make: maze }
};
