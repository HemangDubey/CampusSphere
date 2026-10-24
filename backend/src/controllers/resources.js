const db = require('../db');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');

const KINDS = ['DEPARTMENT', 'LIBRARY', 'FACILITY', 'SUPPORT', 'LINK', 'ORGANIZATION'];

exports.list = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 24, maxSize: 100 });
    const kind = oneOf(req.query.kind, KINDS, 'kind');
    const q = text(req.query.q, 80);
    const category = text(req.query.category, 40);
    const where = {
      ...(kind && { kind }), ...(category && { category }),
      ...(q && { OR: [{ title: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }] })
    };
    const [total, resources, cats] = await Promise.all([
      db.resource.count({ where }),
      db.resource.findMany({ where, orderBy: [{ kind: 'asc' }, { title: 'asc' }], skip, take }),
      db.resource.findMany({ where: kind ? { kind } : {}, distinct: ['category'], select: { category: true } })
    ]);
    ok(res, { resources, categories: cats.map((c) => c.category).filter(Boolean).sort(), page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const resource = await db.resource.findUnique({ where: { id: uuid(req.params.id) } });
    if (!resource) throw new HttpError(404, 'NOT_FOUND', 'Resource not found.');
    ok(res, { resource });
  } catch (e) { next(e); }
};
