// Game rules and scoring (the pure logic used by the browser games), including server-side score limits.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

// Seeded generator so shuffles and mazes are reproducible.
function seeded(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

(async () => {
  const g = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/js/games/logic.js')).href);
  const serverMax = { memory: 2000, reaction: 1000, typing: 3000, pattern: 500, trivia: 1000, maze: 1000 };

  // ---- shuffle is a permutation and deterministic with a seeded source
  const base = [1, 2, 3, 4, 5, 6, 7, 8];
  const a = g.shuffle(base, seeded(7));
  assert.deepEqual([...a].sort(), base);
  assert.deepEqual(a, g.shuffle(base, seeded(7)));
  assert.deepEqual(base, [1, 2, 3, 4, 5, 6, 7, 8], 'input is not mutated');

  // ---- Memory: every difficulty has exactly two cards per pair; scoring rewards fewer moves and less time
  for (const d of g.DIFFICULTIES) {
    const deck = g.memoryDeck(d, seeded(3));
    assert.equal(deck.length, g.MEMORY[d].pairs * 2);
    const counts = {};
    deck.forEach((c) => { counts[c.pair] = (counts[c.pair] || 0) + 1; });
    assert.ok(Object.values(counts).every((n) => n === 2));
    assert.equal(new Set(deck.map((c) => c.id)).size, deck.length, 'unique card ids');
    assert.ok(g.MEMORY[d].pairs <= g.SYMBOLS.length);
  }
  assert.ok(g.memoryScore({ pairs: 8, moves: 8, seconds: 20 }) > g.memoryScore({ pairs: 8, moves: 30, seconds: 20 }));
  assert.ok(g.memoryScore({ pairs: 8, moves: 12, seconds: 20 }) > g.memoryScore({ pairs: 8, moves: 12, seconds: 90 }));
  assert.equal(g.memoryScore({ pairs: 6, moves: 500, seconds: 900 }), 0, 'never negative');
  assert.ok(g.memoryScore({ pairs: 12, moves: 12, seconds: 0 }) <= serverMax.memory);

  // ---- Reaction
  for (const d of g.DIFFICULTIES) {
    const { min, max } = g.REACTION[d];
    for (const r of [0, 0.5, 0.999]) { const delay = g.reactionDelay(d, () => r); assert.ok(delay >= min && delay <= max); }
  }
  assert.ok(g.reactionScore([200, 220, 250]) > g.reactionScore([400, 420, 450]));
  assert.ok(g.reactionScore([200, 200], 0) > g.reactionScore([200, 200], 2), 'false starts cost points');
  assert.equal(g.reactionScore([]), 0);
  assert.equal(g.reactionScore([5000]), 0);
  assert.ok(g.reactionScore([1]) <= serverMax.reaction);

  // ---- Typing
  const target = 'hello world';
  assert.deepEqual(g.typingStats(target, 'hello world', 60), { correct: 11, accuracy: 1, wpm: 2.2 });
  const sloppy = g.typingStats(target, 'hxllo wxrld', 60);
  assert.equal(sloppy.correct, 9);
  assert.ok(g.typingScore(g.typingStats(target, 'hello world', 30)) > g.typingScore(sloppy));
  assert.equal(g.typingStats(target, '', 30).accuracy, 0);
  assert.equal(g.typingScore({ wpm: 0, accuracy: 0 }), 0);
  assert.ok(g.typingScore({ wpm: 400, accuracy: 1 }) <= serverMax.typing);
  assert.ok(g.SENTENCES.every((s) => s.length > 20));

  // ---- Pattern
  let seq = [];
  const rand = seeded(11);
  for (let i = 0; i < 5; i += 1) seq = g.nextPattern(seq, rand);
  assert.equal(seq.length, 5);
  assert.ok(seq.every((n) => n >= 0 && n < 4));
  assert.equal(g.checkPattern(seq, []), 'continue');
  assert.equal(g.checkPattern(seq, seq.slice(0, 3)), 'continue');
  assert.equal(g.checkPattern(seq, seq), 'complete');
  assert.equal(g.checkPattern(seq, [(seq[0] + 1) % 4]), 'wrong');
  assert.equal(g.checkPattern(seq, [...seq.slice(0, 2), (seq[2] + 1) % 4]), 'wrong');
  assert.equal(g.patternScore(7), 70);
  assert.equal(g.patternScore(9999), serverMax.pattern, 'score is capped to the server limit');

  // ---- Trivia
  assert.ok(g.QUESTIONS.every((q) => q.a.length === 4 && q.c >= 0 && q.c < 4 && q.q.endsWith('?')));
  for (const d of g.DIFFICULTIES) {
    const qs = g.triviaQuestions(d, seeded(5));
    assert.equal(qs.length, g.TRIVIA[d].count);
    assert.equal(new Set(qs.map((q) => q.q)).size, qs.length, 'no repeated questions');
  }
  assert.equal(g.triviaPoints(false, 10, 15), 0);
  assert.equal(g.triviaPoints(true, 0, 15), 100);
  assert.equal(g.triviaPoints(true, 15, 15), 150);
  assert.ok(g.triviaPoints(true, 10, 15) > g.triviaPoints(true, 2, 15));
  assert.ok(g.triviaScore(g.TRIVIA.hard.count * 150) <= serverMax.trivia);

  // ---- Maze: solvable, walls respected, scoring
  for (const d of g.DIFFICULTIES) {
    const n = g.MAZE[d];
    const maze = g.makeMaze(n, seeded(21 + n));
    assert.equal(maze.cells.length, n * n);
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) { // walls are symmetric
      const c = maze.cells[y * n + x];
      if (x + 1 < n) assert.equal(c.e, maze.cells[y * n + x + 1].w);
      if (y + 1 < n) assert.equal(c.s, maze.cells[(y + 1) * n + x].n);
    }
    const best = g.shortestPath(maze);
    assert.ok(Number.isFinite(best) && best >= 2 * (n - 1), 'exit is reachable');
  }
  const maze = g.makeMaze(8, seeded(99));
  assert.deepEqual(g.move(maze, { x: 0, y: 0 }, 'ArrowUp'), { x: 0, y: 0 }, 'cannot leave the grid');
  assert.deepEqual(g.move(maze, { x: 0, y: 0 }, 'ArrowLeft'), { x: 0, y: 0 });
  assert.deepEqual(g.move(maze, { x: 0, y: 0 }, 'q'), { x: 0, y: 0 }, 'unknown keys do nothing');
  const open = maze.cells[0].e ? 'ArrowDown' : 'ArrowRight';
  assert.notDeepEqual(g.move(maze, { x: 0, y: 0 }, open), { x: 0, y: 0 }, 'an open side lets you move');
  // walking the shortest route ends at the goal in exactly that many steps
  let pos = { x: 0, y: 0 };
  const goal = { x: 7, y: 7 };
  const best = g.shortestPath(maze);
  const seen = new Set();
  let steps = 0;
  const dfs = (p, depth) => {
    if (p.x === goal.x && p.y === goal.y) return depth;
    seen.add(`${p.x},${p.y}`);
    for (const k of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) { const q = g.move(maze, p, k); if (!seen.has(`${q.x},${q.y}`)) { const r = dfs(q, depth + 1); if (r) return r; } }
    return 0;
  };
  steps = dfs(pos, 0);
  assert.ok(steps >= best, 'any route is at least as long as the shortest');
  assert.equal(g.mazeScore({ optimal: 20, steps: 20, seconds: 0 }), 1000);
  assert.ok(g.mazeScore({ optimal: 20, steps: 40, seconds: 0 }) < g.mazeScore({ optimal: 20, steps: 25, seconds: 0 }));
  assert.ok(g.mazeScore({ optimal: 20, steps: 20, seconds: 100 }) < 1000);
  assert.equal(g.mazeScore({ optimal: 20, steps: 20, seconds: 5000 }), 0);
  assert.ok(g.mazeScore({ optimal: 20, steps: 1, seconds: 0 }) <= serverMax.maze, 'impossible shortcuts cannot exceed the cap');
  console.log('Games logic tests passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
