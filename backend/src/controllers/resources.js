const db = require('../db');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');
const { notifyMany } = require('../services/notify');

const KINDS = ['DEPARTMENT', 'LIBRARY', 'FACILITY', 'SUPPORT', 'LINK', 'ORGANIZATION', 'CLUB', 'SERVICE'];
const STATUSES = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'];

const include = { category: { select: { id: true, name: true } } };

async function userState(user, ids) {
  const out = { bookmarks: new Set(), reading: new Map() };
  if (!user || !ids.length) return out;
  const [b, rl] = await Promise.all([
    db.resourceBookmark.findMany({ where: { userId: user.id, resourceId: { in: ids } }, select: { resourceId: true } }),
    db.readingListItem.findMany({ where: { userId: user.id, resourceId: { in: ids } } })
  ]);
  b.forEach((x) => out.bookmarks.add(x.resourceId));
  rl.forEach((x) => out.reading.set(x.resourceId, x.status));
  return out;
}
const shape = (r, st) => ({ ...r, bookmarked: st.bookmarks.has(r.id), readingStatus: st.reading.get(r.id) || null });

exports.categories = async (req, res, next) => {
  try {
    const kind = oneOf(req.query.kind, KINDS, 'kind');
    const rows = await db.resourceCategory.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { resources: { where: { published: true, ...(kind && { kind }) } } } } } });
    ok(res, { categories: rows.filter((c) => !kind || c._count.resources > 0).map((c) => ({ id: c.id, name: c.name, description: c.description, count: c._count.resources })) });
  } catch (e) { next(e); }
};

exports.list = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 12, maxSize: 100 });
    const kind = oneOf(req.query.kind, KINDS, 'kind');
    const status = oneOf(req.query.status, STATUSES, 'status');
    const q = text(req.query.q, 80);
    const categoryId = req.query.categoryId ? uuid(req.query.categoryId) : undefined;
    const requestable = req.query.requestable === 'true';
    const sort = oneOf(req.query.sort, ['title', 'recent', 'popular'], 'sort') || 'title';
    const tag = text(req.query.tag, 30).toLowerCase();
    const where = {
      published: true, ...(kind && { kind }), ...(status && { status }), ...(categoryId && { categoryId }), ...(requestable && { acceptsRequests: true }), ...(req.query.featured === 'true' && { featured: true }), ...(tag && { tags: { has: tag } }),
      ...(q && { OR: [{ title: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }, { author: { contains: q, mode: 'insensitive' } }, { publisher: { contains: q, mode: 'insensitive' } }, { tags: { has: q.toLowerCase() } }, { category: { name: { contains: q, mode: 'insensitive' } } }] })
    };
    const [total, rows] = await Promise.all([db.resource.count({ where }), db.resource.findMany({ where, include, orderBy: sort === 'recent' ? [{ createdAt: 'desc' }] : sort === 'popular' ? [{ bookmarks: { _count: 'desc' } }, { title: 'asc' }] : [{ title: 'asc' }], skip, take })]);
    const st = await userState(req.user, rows.map((x) => x.id));
    ok(res, { resources: rows.map((x) => shape(x, st)), page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const resource = await db.resource.findUnique({ where: { id: uuid(req.params.id) }, include });
    if (!resource || !resource.published) throw new HttpError(404, 'NOT_FOUND', 'Resource not found.');
    const st = await userState(req.user, [resource.id]);
    if (req.user) await db.resourceView.upsert({ where: { userId_resourceId: { userId: req.user.id, resourceId: resource.id } }, update: { viewedAt: new Date() }, create: { userId: req.user.id, resourceId: resource.id } });
    const related = await db.resource.findMany({ where: { published: true, id: { not: resource.id }, kind: resource.kind }, include, take: 3 });
    ok(res, { resource: shape(resource, st), related: related.map((x) => shape(x, st)) });
  } catch (e) { next(e); }
};

// Discovery home: admin-featured, newest, most saved (real bookmark counts only) and, when signed in, recently viewed.
exports.home = async (req, res, next) => {
  try {
    const kind = oneOf(req.query.kind, KINDS, 'kind');
    const base = { published: true, ...(kind && { kind }) };
    const [featured, recent, popular, viewed] = await Promise.all([
      db.resource.findMany({ where: { ...base, featured: true }, include, orderBy: { title: 'asc' }, take: 6 }),
      db.resource.findMany({ where: base, include, orderBy: { createdAt: 'desc' }, take: 6 }),
      db.resource.findMany({ where: { ...base, bookmarks: { some: {} } }, include, orderBy: [{ bookmarks: { _count: 'desc' } }, { title: 'asc' }], take: 6 }),
      req.user ? db.resourceView.findMany({ where: { userId: req.user.id, resource: base }, include: { resource: { include } }, orderBy: { viewedAt: 'desc' }, take: 6 }) : []
    ]);
    const all = [...featured, ...recent, ...popular, ...viewed.map((v) => v.resource)];
    const st = await userState(req.user, [...new Set(all.map((x) => x.id))]);
    ok(res, { featured: featured.map((x) => shape(x, st)), recent: recent.map((x) => shape(x, st)), popular: popular.map((x) => shape(x, st)), recentlyViewed: viewed.map((v) => shape(v.resource, st)) });
  } catch (e) { next(e); }
};

exports.bookmarks = async (req, res, next) => {
  try {
    const rows = await db.resourceBookmark.findMany({ where: { userId: req.user.id, resource: { published: true } }, include: { resource: { include } }, orderBy: { createdAt: 'desc' } });
    const st = await userState(req.user, rows.map((r) => r.resourceId));
    ok(res, { resources: rows.map((r) => shape(r.resource, st)) });
  } catch (e) { next(e); }
};

async function publishedOr404(id) {
  const r = await db.resource.findFirst({ where: { id: uuid(id), published: true }, select: { id: true, kind: true, title: true } });
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Resource not found.');
  return r;
}

exports.addBookmark = async (req, res, next) => {
  try {
    const r = await publishedOr404(req.params.id);
    await db.resourceBookmark.upsert({ where: { userId_resourceId: { userId: req.user.id, resourceId: r.id } }, update: {}, create: { userId: req.user.id, resourceId: r.id } });
    ok(res, { bookmarked: true }, { status: 201 });
  } catch (e) { next(e); }
};

exports.removeBookmark = async (req, res, next) => {
  try {
    await db.resourceBookmark.deleteMany({ where: { userId: req.user.id, resourceId: uuid(req.params.id) } });
    ok(res, { bookmarked: false });
  } catch (e) { next(e); }
};

exports.readingList = async (req, res, next) => {
  try {
    const rows = await db.readingListItem.findMany({ where: { userId: req.user.id, resource: { published: true } }, include: { resource: { include } }, orderBy: [{ position: 'asc' }, { addedAt: 'desc' }] });
    ok(res, { items: rows.map((r) => ({ status: r.status, notes: r.notes, progress: r.progress, collection: r.collection, position: r.position, addedAt: r.addedAt, resource: r.resource })) });
  } catch (e) { next(e); }
};

exports.setReading = async (req, res, next) => {
  try {
    const r = await publishedOr404(req.params.id);
    if (r.kind !== 'LIBRARY') throw new HttpError(400, 'VALIDATION_ERROR', 'Only library resources can be added to a reading list.');
    const status = oneOf(req.body?.status || 'WANT_TO_READ', ['WANT_TO_READ', 'READING', 'DONE'], 'status');
    const row = await db.readingListItem.upsert({ where: { userId_resourceId: { userId: req.user.id, resourceId: r.id } }, update: { status }, create: { userId: req.user.id, resourceId: r.id, status } });
    ok(res, { item: row }, { status: 201 });
  } catch (e) { next(e); }
};

// Update the private details of a reading-list entry. Only the owner's row is ever touched.
exports.updateReading = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const data = {};
    const errors = {};
    if (req.body?.status !== undefined) { if (!['WANT_TO_READ', 'READING', 'DONE'].includes(req.body.status)) errors.status = 'Choose a valid status.'; else data.status = req.body.status; }
    if (req.body?.notes !== undefined) data.notes = text(req.body.notes, 2000) || null;
    if (req.body?.collection !== undefined) data.collection = text(req.body.collection, 40) || null;
    if (req.body?.progress !== undefined) {
      if (req.body.progress === null || req.body.progress === '') data.progress = null;
      else if (!Number.isInteger(Number(req.body.progress)) || Number(req.body.progress) < 0 || Number(req.body.progress) > 100) errors.progress = 'Progress must be a whole number from 0 to 100.';
      else data.progress = Number(req.body.progress);
    }
    if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
    if (data.status === 'DONE' && data.progress === undefined) data.progress = 100;
    const row = await db.readingListItem.update({ where: { userId_resourceId: { userId: req.user.id, resourceId: id } }, data }).catch((e) => { throw e.code === 'P2025' ? new HttpError(404, 'NOT_FOUND', 'That item is not on your reading list.') : e; });
    ok(res, { item: row }, { message: 'Reading list updated.' });
  } catch (e) { next(e); }
};

exports.reorderReading = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(uuid) : null;
    if (!ids || !ids.length || ids.length > 500 || new Set(ids).size !== ids.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Send each reading-list item once, in the order you want.');
    const owned = await db.readingListItem.count({ where: { userId: req.user.id, resourceId: { in: ids } } });
    if (owned !== ids.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Some items are not on your reading list.');
    await db.$transaction(ids.map((resourceId, position) => db.readingListItem.update({ where: { userId_resourceId: { userId: req.user.id, resourceId } }, data: { position } })));
    ok(res, null, { message: 'Order saved.' });
  } catch (e) { next(e); }
};

// CSV export of the signed-in user's own reading list. Cells that could be read as spreadsheet formulas are neutralised.
exports.exportReading = async (req, res, next) => {
  try {
    const rows = await db.readingListItem.findMany({ where: { userId: req.user.id }, include: { resource: true }, orderBy: [{ position: 'asc' }, { addedAt: 'desc' }] });
    const cell = (v) => { let t = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
    const out = [['Title', 'Author', 'Status', 'Progress %', 'Collection', 'Notes', 'Link'].map(cell).join(',')];
    rows.forEach((r) => out.push([r.resource.title, r.resource.author, r.status, r.progress, r.collection, r.notes, r.resource.accessUrl].map(cell).join(',')));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="reading-list.csv"' }).send(out.join('\r\n'));
  } catch (e) { next(e); }
};

exports.removeReading = async (req, res, next) => {
  try {
    await db.readingListItem.deleteMany({ where: { userId: req.user.id, resourceId: uuid(req.params.id) } });
    ok(res, null, { message: 'Removed from your reading list.' });
  } catch (e) { next(e); }
};

// "Report an issue" sends an in-app notification to campus administrators (no email is sent).
exports.report = async (req, res, next) => {
  try {
    const r = await publishedOr404(req.params.id);
    const message = text(req.body?.message, 500);
    if (message.length < 10) throw new HttpError(400, 'VALIDATION_ERROR', 'Please describe the issue (at least 10 characters).', { message: 'Please describe the issue (at least 10 characters).' });
    const admins = await db.user.findMany({ where: { role: { in: ['CAMPUS_ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' }, select: { id: true } });
    await notifyMany(admins.map((a) => a.id), { type: 'SYSTEM', title: `Issue reported: ${r.title}`, body: `${req.user.name}: ${message}`, link: `/resources/${r.id}` });
    ok(res, { delivered: admins.length }, { status: 201, message: 'Thanks, your report was sent to the administrators.' });
  } catch (e) { next(e); }
};
