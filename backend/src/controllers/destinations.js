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
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 9 });
    const q = text(req.query.q, 80);
    const type = oneOf(req.query.type, TYPES, 'type');
    const budget = oneOf(req.query.budget, BUDGETS, 'budget');
    const sort = oneOf(req.query.sort, ['name', 'budget', 'popularity', 'duration', 'distance'], 'sort') || 'name';
    const days = req.query.days === undefined || req.query.days === '' ? undefined : Number(req.query.days);
    const maxKm = req.query.maxKm === undefined || req.query.maxKm === '' ? undefined : Number(req.query.maxKm);
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 14)) throw new HttpError(400, 'VALIDATION_ERROR', 'days must be a whole number from 1 to 14.');
    if (maxKm !== undefined && (!Number.isInteger(maxKm) || maxKm < 1 || maxKm > 5000)) throw new HttpError(400, 'VALIDATION_ERROR', 'maxKm must be a whole number from 1 to 5000.');
    const where = {
      published: true, ...(type && { type }), ...(budget && { budget }),
      ...(days !== undefined && { recommendedDays: { lte: days } }), ...(maxKm !== undefined && { distanceKm: { lte: maxKm } }),
      ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }, { region: { contains: q, mode: 'insensitive' } }, { activities: { has: q } }] })
    };
    const orderBy = { name: [{ name: 'asc' }], budget: [{ budgetMinInr: 'asc' }], popularity: [{ popularity: 'desc' }, { name: 'asc' }], duration: [{ recommendedDays: 'asc' }, { name: 'asc' }], distance: [{ distanceKm: 'asc' }] }[sort];
    const [total, rows] = await Promise.all([db.destination.count({ where }), db.destination.findMany({ where, orderBy, skip, take })]);
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

exports.recent = async (req, res, next) => {
  try {
    const rows = await db.recentDestinationView.findMany({ where: { userId: req.user.id, destination: { published: true } }, include: { destination: true }, orderBy: { viewedAt: 'desc' }, take: 6 });
    const favs = await favoriteSet(req.user, rows.map((r) => r.destinationId));
    ok(res, { destinations: rows.map((r) => shape(r.destination, favs)) });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const d = await db.destination.findUnique({ where: { slug: text(req.params.slug, 80) } });
    if (!d || !d.published) throw new HttpError(404, 'NOT_FOUND', 'Destination not found.');
    if (req.user) {
      await db.recentDestinationView.upsert({ where: { userId_destinationId: { userId: req.user.id, destinationId: d.id } }, update: { viewedAt: new Date() }, create: { userId: req.user.id, destinationId: d.id } });
    }
    await db.destination.update({ where: { id: d.id }, data: { popularity: { increment: 1 } } }).catch(() => {});
    const related = await db.destination.findMany({ where: { published: true, id: { not: d.id }, OR: [{ type: d.type }, { budget: d.budget }] }, orderBy: { popularity: 'desc' }, take: 3 });
    const favs = await favoriteSet(req.user, [d.id, ...related.map((x) => x.id)]);
    ok(res, { destination: shape(d, favs), related: related.map((x) => shape(x, favs)) });
  } catch (e) { next(e); }
};

exports.addFavorite = async (req, res, next) => {
  try {
    const destinationId = uuid(req.params.id);
    if (!(await db.destination.findFirst({ where: { id: destinationId, published: true }, select: { id: true } }))) throw new HttpError(404, 'NOT_FOUND', 'Destination not found.');
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
