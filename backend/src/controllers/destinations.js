const db = require('../db');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');

const TYPES = ['HERITAGE', 'NATURE', 'SPIRITUAL', 'BEACH', 'CITY'];
const BUDGETS = ['BUDGET', 'MODERATE', 'PREMIUM'];

async function favoriteSet(user, ids) {
  if (!user || !ids.length) return new Set();
  const rows = await db.favoriteDestination.findMany({ where: { userId: user.id, destinationId: { in: ids } }, select: { destinationId: true } });
  return new Set(rows.map((r) => r.destinationId));
}
const shape = (d, favs) => ({ ...d, favorited: favs.has(d.id), approximate: true });

exports.list = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 12 });
    const q = text(req.query.q, 80);
    const type = oneOf(req.query.type, TYPES, 'type');
    const budget = oneOf(req.query.budget, BUDGETS, 'budget');
    const where = {
      ...(type && { type }), ...(budget && { budget }),
      ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }, { region: { contains: q, mode: 'insensitive' } }] })
    };
    const [total, rows] = await Promise.all([db.destination.count({ where }), db.destination.findMany({ where, orderBy: { name: 'asc' }, skip, take })]);
    const favs = await favoriteSet(req.user, rows.map((r) => r.id));
    ok(res, { destinations: rows.map((r) => shape(r, favs)), page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.favorites = async (req, res, next) => {
  try {
    const rows = await db.favoriteDestination.findMany({ where: { userId: req.user.id }, include: { destination: true }, orderBy: { createdAt: 'desc' } });
    const favs = new Set(rows.map((r) => r.destinationId));
    ok(res, { destinations: rows.map((r) => shape(r.destination, favs)) });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const slug = text(req.params.slug, 80);
    const d = await db.destination.findUnique({ where: { slug } });
    if (!d) throw new HttpError(404, 'NOT_FOUND', 'Destination not found.');
    ok(res, { destination: shape(d, await favoriteSet(req.user, [d.id])) });
  } catch (e) { next(e); }
};

exports.addFavorite = async (req, res, next) => {
  try {
    const destinationId = uuid(req.params.id);
    if (!(await db.destination.findUnique({ where: { id: destinationId }, select: { id: true } }))) throw new HttpError(404, 'NOT_FOUND', 'Destination not found.');
    // Idempotent: the unique (user, destination) pair prevents duplicates.
    await db.favoriteDestination.upsert({ where: { userId_destinationId: { userId: req.user.id, destinationId } }, update: {}, create: { userId: req.user.id, destinationId } });
    ok(res, { favorited: true }, { status: 201 });
  } catch (e) { next(e); }
};

exports.removeFavorite = async (req, res, next) => {
  try {
    const destinationId = uuid(req.params.id);
    await db.favoriteDestination.deleteMany({ where: { userId: req.user.id, destinationId } });
    ok(res, { favorited: false });
  } catch (e) { next(e); }
};
