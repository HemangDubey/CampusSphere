// Game scores. Games run in the browser, so scores are self-reported: the server validates the game, the
// difficulty and a plausible score range, but cannot prove the game was played honestly. The leaderboard is
// therefore for fun, not for prizes. Ranking rule: for each game and difficulty, each player's single best
// score counts; ties are broken by who reached the score first.
const db = require('../db');
const { ok, HttpError } = require('../utils/response');
const { oneOf } = require('../utils/query');

// Every game reports "points" where higher is better. maxScore guards against absurd values.
const GAMES = {
  memory: { title: 'Memory Match', maxScore: 2000 },
  reaction: { title: 'Reaction Time', maxScore: 1000 },
  typing: { title: 'Keyboard Speed', maxScore: 3000 },
  pattern: { title: 'Pattern Recall', maxScore: 500 },
  trivia: { title: 'Campus Trivia', maxScore: 1000 },
  maze: { title: 'Maze Runner', maxScore: 1000 }
};
const LEVELS = ['easy', 'normal', 'hard'];

exports.list = (req, res) => ok(res, { games: Object.entries(GAMES).map(([id, g]) => ({ id, ...g })), difficulties: LEVELS });

exports.submit = async (req, res, next) => {
  try {
    const game = oneOf(req.body?.game, Object.keys(GAMES), 'game');
    const difficulty = oneOf(req.body?.difficulty || 'normal', LEVELS, 'difficulty');
    const score = req.body?.score;
    if (!game) throw new HttpError(400, 'VALIDATION_ERROR', 'Unknown game.');
    if (!Number.isInteger(score) || score < 0 || score > GAMES[game].maxScore) throw new HttpError(400, 'VALIDATION_ERROR', `Score must be a whole number from 0 to ${GAMES[game].maxScore}.`);
    const rawMeta = req.body?.meta;
    if (rawMeta !== undefined && (rawMeta === null || typeof rawMeta !== 'object' || Array.isArray(rawMeta))) throw new HttpError(400, 'VALIDATION_ERROR', 'meta must be an object.');
    const meta = rawMeta ? JSON.parse(JSON.stringify(rawMeta)) : undefined;
    if (meta && JSON.stringify(meta).length > 500) throw new HttpError(400, 'VALIDATION_ERROR', 'meta is too large.');
    const best = await db.gameScore.aggregate({ where: { userId: req.user.id, game, difficulty }, _max: { score: true } });
    const row = await db.gameScore.create({ data: { userId: req.user.id, game, difficulty, score, meta } });
    ok(res, { score: row, personalBest: Math.max(best._max.score ?? -1, score), isNewBest: score > (best._max.score ?? -1) }, { status: 201 });
  } catch (e) { next(e); }
};

exports.mine = async (req, res, next) => {
  try {
    const rows = await db.gameScore.groupBy({ by: ['game', 'difficulty'], where: { userId: req.user.id }, _max: { score: true }, _count: true });
    ok(res, { bests: rows.map((r) => ({ game: r.game, difficulty: r.difficulty, best: r._max.score, plays: r._count })) });
  } catch (e) { next(e); }
};

exports.leaderboard = async (req, res, next) => {
  try {
    const game = oneOf(req.query.game, Object.keys(GAMES), 'game');
    const difficulty = oneOf(req.query.difficulty || 'normal', LEVELS, 'difficulty');
    if (!game) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a game.');
    const best = await db.gameScore.groupBy({ by: ['userId'], where: { game, difficulty }, _max: { score: true }, orderBy: { _max: { score: 'desc' } }, take: 50 });
    // Earliest time each player reached their best, for tie-breaking.
    const rows = [];
    for (const b of best) {
      const first = await db.gameScore.findFirst({ where: { userId: b.userId, game, difficulty, score: b._max.score }, orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } });
      rows.push({ userId: b.userId, name: first.user.name.split(' ')[0], score: b._max.score, at: first.createdAt });
    }
    rows.sort((a, b) => b.score - a.score || a.at - b.at);
    ok(res, { game, difficulty, rule: 'Each player\'s best score counts. Ties go to the player who reached it first. Scores are self-reported by the browser games.', entries: rows.slice(0, 10).map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, isYou: r.userId === req.user?.id })) });
  } catch (e) { next(e); }
};
