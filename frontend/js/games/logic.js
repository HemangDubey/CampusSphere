// Pure game rules and scoring (no DOM), shared by the game screens and unit-tested in Node.
// Every game reports an integer "points" score where higher is better; the server only checks the range.

export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ---------------------------------------------------------------- Memory Match
export const MEMORY = { easy: { pairs: 6, cols: 4 }, normal: { pairs: 8, cols: 4 }, hard: { pairs: 12, cols: 6 } };
export const SYMBOLS = ['🎓', '📚', '🧪', '🎨', '⚽', '🎵', '💻', '🌿', '🚌', '☕', '🔬', '🎯'];

// Fisher-Yates with an injectable random source so tests are deterministic.
export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function memoryDeck(difficulty, rand = Math.random) {
  const { pairs } = MEMORY[difficulty];
  return shuffle(SYMBOLS.slice(0, pairs).flatMap((s, i) => [{ id: `${i}a`, pair: i, symbol: s }, { id: `${i}b`, pair: i, symbol: s }]), rand);
}

// Fewer moves and less time score higher.
export function memoryScore({ pairs, moves, seconds }) {
  return clamp(Math.round(pairs * 150 - Math.max(0, moves - pairs) * 8 - seconds * 3), 0, 2000);
}

// ---------------------------------------------------------------- Reaction Time
export const REACTION = { easy: { rounds: 3, min: 1500, max: 3500 }, normal: { rounds: 5, min: 1200, max: 4000 }, hard: { rounds: 7, min: 1000, max: 5000 } };
export function reactionDelay(difficulty, rand = Math.random) {
  const { min, max } = REACTION[difficulty];
  return Math.round(min + rand() * (max - min));
}
// A false start (reacting before the signal) counts as a 600 ms round.
export function reactionScore(timesMs, falseStarts = 0) {
  if (!timesMs.length) return 0;
  const all = [...timesMs, ...Array(falseStarts).fill(600)];
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  return clamp(Math.round(1000 - avg * 1.5), 0, 1000);
}

// ---------------------------------------------------------------- Keyboard Speed
export const TYPING = { easy: 30, normal: 45, hard: 60 };
export const SENTENCES = [
  'A good plan today is better than a perfect plan tomorrow.',
  'The library opens early so students can study in peace.',
  'Every event handler runs when the browser notices a click or a key.',
  'Semantic HTML makes pages easier to read for people and machines.',
  'Practice a little every day and the hard topics get easier.',
  'Responsive layouts adapt to phones, tablets and large screens.',
  'Asking a clear question is half of finding the answer.'
];
export function typingStats(target, typed, seconds) {
  let correct = 0;
  for (let i = 0; i < typed.length; i += 1) if (typed[i] === target[i]) correct += 1;
  const accuracy = typed.length ? correct / typed.length : 0;
  const wpm = seconds > 0 ? correct / 5 / (seconds / 60) : 0;
  return { correct, accuracy, wpm };
}
export function typingScore({ wpm, accuracy }) {
  return clamp(Math.round(wpm * accuracy * accuracy * 10), 0, 3000);
}

// ---------------------------------------------------------------- Pattern Recall
export const PATTERN = { easy: { speed: 700 }, normal: { speed: 500 }, hard: { speed: 320 } };
export const nextPattern = (seq, rand = Math.random) => [...seq, Math.floor(rand() * 4)];
export const patternScore = (levelsCompleted) => clamp(levelsCompleted * 10, 0, 500);
// Returns 'wrong', 'continue' or 'complete' for the player's input so far.
export function checkPattern(seq, input) {
  for (let i = 0; i < input.length; i += 1) if (input[i] !== seq[i]) return 'wrong';
  return input.length === seq.length ? 'complete' : 'continue';
}

// ---------------------------------------------------------------- Campus Trivia (study edition)
export const QUESTIONS = [
  { q: 'Which HTML element holds the main navigation links of a page?', a: ['<nav>', '<footer>', '<aside>', '<section>'], c: 0 },
  { q: 'Which CSS property controls the space inside an element, between its content and border?', a: ['margin', 'padding', 'gap', 'outline'], c: 1 },
  { q: 'Which JavaScript event fires when a user presses a key down?', a: ['keyup', 'keydown', 'keyhold', 'press'], c: 1 },
  { q: 'What does the "C" in CSS stand for?', a: ['Computed', 'Creative', 'Cascading', 'Compiled'], c: 2 },
  { q: 'Which HTML attribute gives an image text for screen readers?', a: ['title', 'src', 'alt', 'name'], c: 2 },
  { q: 'Which mouse event fires only once when the pointer enters an element and does not bubble?', a: ['mouseover', 'mouseenter', 'mousemove', 'click'], c: 1 },
  { q: 'Which symbol checks strict equality in JavaScript?', a: ['==', '=', '===', '!='], c: 2 },
  { q: 'What does HTTP status 404 mean?', a: ['Server error', 'Not found', 'Unauthorized', 'Redirect'], c: 1 },
  { q: 'Which SQL clause filters rows?', a: ['ORDER BY', 'GROUP BY', 'WHERE', 'SELECT'], c: 2 },
  { q: 'In Git, which command records staged changes?', a: ['git push', 'git commit', 'git clone', 'git fetch'], c: 1 },
  { q: 'Which CSS layout system arranges items in rows and columns on two axes?', a: ['Flexbox', 'Float', 'Grid', 'Table'], c: 2 },
  { q: 'What is the purpose of the HTML label element?', a: ['Style text', 'Describe a form control', 'Embed video', 'Create a link'], c: 1 },
  { q: 'Which data structure follows first-in, first-out order?', a: ['Stack', 'Queue', 'Tree', 'Graph'], c: 1 },
  { q: 'What does "responsive design" mainly mean?', a: ['Fast server', 'Layout adapts to screen size', 'Uses animations', 'Works offline'], c: 1 },
  { q: 'Which method converts a JSON string into a JavaScript object?', a: ['JSON.stringify', 'JSON.parse', 'JSON.build', 'JSON.object'], c: 1 },
  { q: 'Which password practice is best?', a: ['Reuse one password', 'Use a long unique passphrase', 'Share with friends', 'Use your birthday'], c: 1 },
  { q: 'What does a primary key do in a database table?', a: ['Encrypts data', 'Uniquely identifies each row', 'Sorts rows', 'Deletes duplicates'], c: 1 },
  { q: 'Which keyboard property reports the physical key, independent of layout?', a: ['key', 'code', 'char', 'which'], c: 1 }
];
export const TRIVIA = { easy: { count: 5, seconds: 20 }, normal: { count: 8, seconds: 15 }, hard: { count: 10, seconds: 10 } };
export const triviaQuestions = (difficulty, rand = Math.random) => shuffle(QUESTIONS, rand).slice(0, TRIVIA[difficulty].count);
// 100 per correct answer, plus up to 50 for answering quickly.
export const triviaPoints = (correct, secondsLeft, secondsAllowed) => (correct ? 100 + Math.round(50 * clamp(secondsLeft / secondsAllowed, 0, 1)) : 0);
export const triviaScore = (points) => clamp(points, 0, 1000);

// ---------------------------------------------------------------- Maze Runner
export const MAZE = { easy: 8, normal: 12, hard: 16 };

// Recursive-backtracker maze on an n x n grid. Cell walls: { n, e, s, w } (true = wall).
export function makeMaze(n, rand = Math.random) {
  const cells = Array.from({ length: n * n }, () => ({ n: true, e: true, s: true, w: true, seen: false }));
  const at = (x, y) => cells[y * n + x];
  const stack = [[0, 0]];
  at(0, 0).seen = true;
  const dirs = [['n', 0, -1, 's'], ['e', 1, 0, 'w'], ['s', 0, 1, 'n'], ['w', -1, 0, 'e']];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = shuffle(dirs, rand).filter(([, dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < n && y + dy < n && !at(x + dx, y + dy).seen);
    if (!options.length) { stack.pop(); continue; }
    const [d, dx, dy, opp] = options[0];
    at(x, y)[d] = false;
    at(x + dx, y + dy)[opp] = false;
    at(x + dx, y + dy).seen = true;
    stack.push([x + dx, y + dy]);
  }
  return { n, cells: cells.map(({ n: a, e, s, w }) => ({ n: a, e, s, w })) };
}

export const DIR = { ArrowUp: ['n', 0, -1], ArrowRight: ['e', 1, 0], ArrowDown: ['s', 0, 1], ArrowLeft: ['w', -1, 0], w: ['n', 0, -1], d: ['e', 1, 0], s: ['s', 0, 1], a: ['w', -1, 0] };
// Returns the new position, or the same position if a wall (or the edge) blocks the move.
export function move(maze, pos, key) {
  const d = DIR[key] || DIR[String(key).toLowerCase()];
  if (!d) return pos;
  const [side, dx, dy] = d;
  const cell = maze.cells[pos.y * maze.n + pos.x];
  const nx = pos.x + dx;
  const ny = pos.y + dy;
  if (cell[side] || nx < 0 || ny < 0 || nx >= maze.n || ny >= maze.n) return pos;
  return { x: nx, y: ny };
}
// Shortest number of steps from the start to the exit (always exists in a generated maze).
export function shortestPath(maze) {
  const goal = maze.n - 1;
  const seen = new Set(['0,0']);
  let frontier = [{ x: 0, y: 0 }];
  for (let steps = 0; frontier.length; steps += 1) {
    const next = [];
    for (const p of frontier) {
      if (p.x === goal && p.y === goal) return steps;
      for (const k of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) {
        const q = move(maze, p, k);
        const id = `${q.x},${q.y}`;
        if (!seen.has(id)) { seen.add(id); next.push(q); }
      }
    }
    frontier = next;
  }
  return Infinity;
}
export const mazeScore = ({ optimal, steps, seconds }) => clamp(Math.round(1000 * (optimal / Math.max(steps, optimal, 1)) - seconds), 0, 1000);
