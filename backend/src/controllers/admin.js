// Administration: users and roles, audit log, reports, and content management
// (destinations, resources, categories, announcements). Each route is guarded by requirePermission in routes/admin.js.
const db = require('../db');
const r = require('../validators/rules');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');
const { audit } = require('../services/audit');
const { notify } = require('../services/notify');
const { ROLES } = require('../permissions');

const fail = (errors) => { throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors); };
const check = (body, schema) => { const { errors, values } = r.validate(body, schema); if (Object.keys(errors).length) fail(errors); return values; };

// ---------------------------------------------------------------- users and roles (SUPER_ADMIN)
exports.users = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 20 });
    const q = text(req.query.q, 60);
    const role = oneOf(req.query.role, ROLES, 'role');
    const status = oneOf(req.query.status, ['ACTIVE', 'SUSPENDED'], 'status');
    const where = { ...(role && { role }), ...(status && { status }), ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }) };
    const [total, rows] = await Promise.all([db.user.count({ where }), db.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, name: true, email: true, role: true, status: true, department: true, createdAt: true } })]);
    ok(res, { users: rows, roles: ROLES, page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.updateUser = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
    const role = req.body?.role === undefined ? undefined : oneOf(req.body.role, ROLES, 'role');
    const status = req.body?.status === undefined ? undefined : oneOf(req.body.status, ['ACTIVE', 'SUSPENDED'], 'status');
    if (role === undefined && status === undefined) throw new HttpError(400, 'VALIDATION_ERROR', 'Nothing to change.');
    if (id === req.user.id) throw new HttpError(409, 'INVALID_STATE', 'You cannot change your own role or status.');
    const losingAdmin = target.role === 'SUPER_ADMIN' && ((role && role !== 'SUPER_ADMIN') || status === 'SUSPENDED');
    if (losingAdmin && (await db.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { not: id } } })) === 0) {
      throw new HttpError(409, 'INVALID_STATE', 'The platform must keep at least one active super administrator.');
    }
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: { ...(role && { role }), ...(status && { status }) }, select: { id: true, name: true, email: true, role: true, status: true } });
      // Role changes and suspensions take effect immediately by ending existing sessions.
      if ((role && role !== target.role) || status === 'SUSPENDED') await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return u;
    });
    if (role && role !== target.role) await audit(req.user, 'user.role', 'User', id, `Changed ${target.email} role ${target.role} -> ${role}`);
    if (status && status !== target.status) await audit(req.user, 'user.status', 'User', id, `${status === 'SUSPENDED' ? 'Suspended' : 'Reactivated'} ${target.email}`);
    ok(res, { user: updated }, { message: 'User updated.' });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------- audit log and reports
exports.audit = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 25, maxSize: 100 });
    const entityType = text(req.query.entityType, 40);
    const q = text(req.query.q, 60);
    const where = { ...(entityType && { entityType }), ...(q && { OR: [{ summary: { contains: q, mode: 'insensitive' } }, { action: { contains: q, mode: 'insensitive' } }] }) };
    const [total, rows, types] = await Promise.all([
      db.auditLog.count({ where }), db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { actor: { select: { name: true, role: true } } } }),
      db.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true } })
    ]);
    ok(res, { logs: rows, entityTypes: types.map((t) => t.entityType).sort(), page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

const countBy = async (model, field, where = {}) => Object.fromEntries((await db[model].groupBy({ by: [field], where, _count: true })).map((x) => [x[field], x._count]));

exports.reports = async (req, res, next) => {
  try {
    const now = new Date();
    const open = { status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED'] } };
    const [users, events, regsByStatus, requestsByStatus, overdue, leaveByStatus, apptByStatus, topEvents, catRegs, gamePlays] = await Promise.all([
      countBy('user', 'role'),
      db.event.groupBy({ by: ['status'], _count: true }).then((x) => Object.fromEntries(x.map((i) => [i.status, i._count]))),
      countBy('eventRegistration', 'status'),
      countBy('serviceRequest', 'status'),
      db.serviceRequest.count({ where: { ...open, dueAt: { lt: now } } }),
      countBy('leaveRequest', 'status'),
      countBy('appointment', 'status'),
      db.event.findMany({ where: { status: 'PUBLISHED' }, orderBy: { registrations: { _count: 'desc' } }, take: 5, select: { id: true, title: true, capacity: true, _count: { select: { registrations: { where: { status: 'REGISTERED' } } } } } }),
      db.eventRegistration.findMany({ where: { status: 'REGISTERED' }, select: { event: { select: { category: true } } } }),
      db.gameScore.count()
    ]);
    const perCategory = {};
    catRegs.forEach((x) => { perCategory[x.event.category] = (perCategory[x.event.category] || 0) + 1; });
    ok(res, {
      generatedAt: now,
      users, events, registrations: regsByStatus, serviceRequests: { byStatus: requestsByStatus, overdue }, leave: leaveByStatus, appointments: apptByStatus,
      topEvents: topEvents.map((e) => ({ id: e.id, title: e.title, registered: e._count.registrations, capacity: e.capacity, utilization: e.capacity ? Math.round((e._count.registrations / e.capacity) * 100) : null })),
      registrationsByCategory: perCategory, gamePlays
    });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------- destinations
const destSchema = {
  name: [r.required('Enter a name.'), r.minLength(2), r.maxLength(80)], slug: [r.required('Enter a slug.'), r.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes.'), r.maxLength(60)],
  region: [r.required('Enter a region.'), r.maxLength(80)], type: [r.required('Choose a type.'), r.oneOf(['HERITAGE', 'NATURE', 'SPIRITUAL', 'BEACH', 'CITY'])],
  budget: [r.required('Choose a budget category.'), r.oneOf(['BUDGET', 'MODERATE', 'PREMIUM'])], summary: [r.required('Enter a summary.'), r.maxLength(200)],
  description: [r.required('Enter a description.'), r.minLength(20), r.maxLength(4000)], budgetMinInr: [r.required('Enter the lowest estimate.'), r.intRange(0, 1000000)],
  budgetMaxInr: [r.required('Enter the highest estimate.'), r.intRange(0, 1000000)], recommendedDays: [r.required('Enter the suggested days.'), r.intRange(1, 30)],
  distanceKm: [r.intRange(1, 5000)], bestTime: [r.maxLength(120)], imageUrl: [r.httpsUrl()]
};
const lines = (v) => String(v || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20);
function destData(body) {
  const v = check(body, destSchema);
  if (Number(v.budgetMaxInr) < Number(v.budgetMinInr)) fail({ budgetMaxInr: 'The highest estimate cannot be below the lowest.' });
  const gallery = lines(body.gallery);
  for (const g of gallery) if (r.httpsUrl()(g)) fail({ gallery: 'Every gallery line must be an https:// link.' });
  let itineraryIdeas = null;
  if (body.itineraryIdeas) {
    itineraryIdeas = Array.isArray(body.itineraryIdeas) ? body.itineraryIdeas : null;
    if (!itineraryIdeas || itineraryIdeas.length > 10 || JSON.stringify(itineraryIdeas).length > 4000) fail({ itineraryIdeas: 'Itinerary ideas must be a short list.' });
  }
  return {
    name: v.name, slug: v.slug, region: v.region, type: v.type, budget: v.budget, summary: v.summary, description: v.description,
    budgetMinInr: Number(v.budgetMinInr), budgetMaxInr: Number(v.budgetMaxInr), recommendedDays: Number(v.recommendedDays),
    distanceKm: v.distanceKm ? Number(v.distanceKm) : null, bestTime: v.bestTime || null, imageUrl: v.imageUrl || null,
    tips: lines(body.tips), activities: lines(body.activities), gallery, itineraryIdeas, published: body.published !== false, isDemo: false
  };
}
const dup = (e, field) => (e.code === 'P2002' ? new HttpError(409, 'DUPLICATE', 'That value is already used.', { [field]: 'Already in use.' }) : e);

exports.destinations = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 20 });
    const q = text(req.query.q, 60);
    const where = q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { region: { contains: q, mode: 'insensitive' } }] } : {};
    const [total, rows] = await Promise.all([db.destination.count({ where }), db.destination.findMany({ where, orderBy: { name: 'asc' }, skip, take })]);
    ok(res, { destinations: rows, page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};
exports.createDestination = async (req, res, next) => {
  try {
    const d = await db.destination.create({ data: destData(req.body) }).catch((e) => { throw dup(e, 'slug'); });
    await audit(req.user, 'destination.create', 'Destination', d.id, `Created destination "${d.name}"`);
    ok(res, { destination: d }, { status: 201, message: 'Destination created.' });
  } catch (e) { next(e); }
};
exports.updateDestination = async (req, res, next) => {
  try {
    const d = await db.destination.update({ where: { id: uuid(req.params.id) }, data: destData(req.body) }).catch((e) => { throw e.code === 'P2025' ? new HttpError(404, 'NOT_FOUND', 'Destination not found.') : dup(e, 'slug'); });
    await audit(req.user, 'destination.update', 'Destination', d.id, `Updated destination "${d.name}"${d.published ? '' : ' (unpublished)'}`);
    ok(res, { destination: d }, { message: 'Destination saved.' });
  } catch (e) { next(e); }
};
exports.deleteDestination = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const d = await db.destination.findUnique({ where: { id } });
    if (!d) throw new HttpError(404, 'NOT_FOUND', 'Destination not found.');
    await db.destination.delete({ where: { id } });
    await audit(req.user, 'destination.delete', 'Destination', id, `Deleted destination "${d.name}"`);
    ok(res, null, { message: 'Destination deleted.' });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------- categories
const catSchema = { name: [r.required('Enter a name.'), r.minLength(2), r.maxLength(60)], description: [r.maxLength(200)] };
exports.categories = async (req, res, next) => {
  try { ok(res, { categories: await db.resourceCategory.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { resources: true } } } }) }); } catch (e) { next(e); }
};
exports.createCategory = async (req, res, next) => {
  try {
    const v = check(req.body, catSchema);
    const c = await db.resourceCategory.create({ data: { name: v.name, description: v.description || null } }).catch((e) => { throw dup(e, 'name'); });
    await audit(req.user, 'category.create', 'ResourceCategory', c.id, `Created category "${c.name}"`);
    ok(res, { category: c }, { status: 201, message: 'Category created.' });
  } catch (e) { next(e); }
};
exports.updateCategory = async (req, res, next) => {
  try {
    const v = check(req.body, catSchema);
    const c = await db.resourceCategory.update({ where: { id: uuid(req.params.id) }, data: { name: v.name, description: v.description || null } }).catch((e) => { throw e.code === 'P2025' ? new HttpError(404, 'NOT_FOUND', 'Category not found.') : dup(e, 'name'); });
    await audit(req.user, 'category.update', 'ResourceCategory', c.id, `Renamed category to "${c.name}"`);
    ok(res, { category: c }, { message: 'Category saved.' });
  } catch (e) { next(e); }
};
exports.deleteCategory = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const c = await db.resourceCategory.findUnique({ where: { id }, include: { _count: { select: { resources: true } } } });
    if (!c) throw new HttpError(404, 'NOT_FOUND', 'Category not found.');
    if (c._count.resources) throw new HttpError(409, 'IN_USE', `${c._count.resources} resource(s) use this category. Move them first.`);
    await db.resourceCategory.delete({ where: { id } });
    await audit(req.user, 'category.delete', 'ResourceCategory', id, `Deleted category "${c.name}"`);
    ok(res, null, { message: 'Category deleted.' });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------- resources
const KINDS = ['DEPARTMENT', 'LIBRARY', 'FACILITY', 'SUPPORT', 'LINK', 'ORGANIZATION', 'CLUB', 'SERVICE'];
const resSchema = {
  kind: [r.required('Choose a type.'), r.oneOf(KINDS)], title: [r.required('Enter a title.'), r.minLength(2), r.maxLength(120)], summary: [r.required('Enter a summary.'), r.maxLength(300)],
  details: [r.maxLength(3000)], author: [r.maxLength(120)], status: [r.required('Choose an availability.'), r.oneOf(['AVAILABLE', 'LIMITED', 'UNAVAILABLE'])],
  eligibility: [r.maxLength(500)], instructions: [r.maxLength(2000)], contactInfo: [r.maxLength(300)], imageUrl: [r.httpsUrl()],
  accessUrl: [r.httpsUrl()], publisher: [r.maxLength(120)], publishedYear: [r.intRange(1400, 2100, 'Enter a four-digit year.')]
};
function validFields(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  let list = raw;
  if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch { fail({ formFields: 'Form fields must be valid JSON.' }); } }
  if (!Array.isArray(list) || list.length > 12) fail({ formFields: 'Use a list of at most 12 fields.' });
  return list.map((f, i) => {
    if (!f || typeof f.name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,29}$/.test(f.name) || typeof f.label !== 'string' || !f.label.trim() || !['text', 'textarea', 'select', 'date', 'number'].includes(f.type)) fail({ formFields: `Field ${i + 1} needs a name (letters/numbers), a label and a type (text, textarea, select, date, number).` });
    if (f.type === 'select' && (!Array.isArray(f.options) || !f.options.length || f.options.length > 20)) fail({ formFields: `Field ${i + 1}: select fields need 1 to 20 options.` });
    return { name: f.name, label: f.label.trim().slice(0, 80), type: f.type, required: Boolean(f.required), ...(f.type === 'select' && { options: f.options.map((o) => String(o).slice(0, 60)) }), ...(f.maxLength && { maxLength: Math.min(Number(f.maxLength) || 1000, 2000) }) };
  });
}
async function resData(body) {
  const v = check(body, resSchema);
  const reqDocs = lines(body.requiredDocuments);
  let categoryId = null;
  if (body.categoryId) { categoryId = uuid(body.categoryId); if (!(await db.resourceCategory.findUnique({ where: { id: categoryId } }))) fail({ categoryId: 'Choose a category from the list.' }); }
  const formFields = validFields(body.formFields);
  const acceptsRequests = Boolean(body.acceptsRequests);
  if (acceptsRequests && (!formFields || !formFields.length)) fail({ formFields: 'A resource that accepts requests needs at least one form field.' });
  return {
    kind: v.kind, title: v.title, summary: v.summary, details: v.details || null, author: v.author || null, status: v.status, eligibility: v.eligibility || null,
    instructions: v.instructions || null, contactInfo: v.contactInfo || null, imageUrl: v.imageUrl || null, requiredDocuments: reqDocs, categoryId,
    acceptsRequests, formFields: formFields || undefined, published: body.published !== false, isDemo: false,
    featured: Boolean(body.featured), accessUrl: v.accessUrl || null, publisher: v.publisher || null, publishedYear: v.publishedYear ? Number(v.publishedYear) : null,
    tags: lines(body.tags).flatMap((t) => t.split(',')).map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 10)
  };
}
exports.resources = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 20 });
    const q = text(req.query.q, 60);
    const kind = oneOf(req.query.kind, KINDS, 'kind');
    const where = { ...(kind && { kind }), ...(q && { title: { contains: q, mode: 'insensitive' } }) };
    const [total, rows] = await Promise.all([db.resource.count({ where }), db.resource.findMany({ where, orderBy: { title: 'asc' }, skip, take, include: { category: { select: { id: true, name: true } } } })]);
    ok(res, { resources: rows, page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};
exports.createResource = async (req, res, next) => {
  try {
    const x = await db.resource.create({ data: await resData(req.body) });
    await audit(req.user, 'resource.create', 'Resource', x.id, `Created resource "${x.title}"`);
    ok(res, { resource: x }, { status: 201, message: 'Resource created.' });
  } catch (e) { next(e); }
};
exports.updateResource = async (req, res, next) => {
  try {
    const data = await resData(req.body);
    const x = await db.resource.update({ where: { id: uuid(req.params.id) }, data }).catch((e) => { throw e.code === 'P2025' ? new HttpError(404, 'NOT_FOUND', 'Resource not found.') : e; });
    await audit(req.user, 'resource.update', 'Resource', x.id, `Updated resource "${x.title}"${x.published ? '' : ' (unpublished)'}`);
    ok(res, { resource: x }, { message: 'Resource saved.' });
  } catch (e) { next(e); }
};
exports.deleteResource = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const x = await db.resource.findUnique({ where: { id } });
    if (!x) throw new HttpError(404, 'NOT_FOUND', 'Resource not found.');
    if (await db.serviceRequest.count({ where: { resourceId: id } })) throw new HttpError(409, 'IN_USE', 'This resource has service requests. Unpublish it instead of deleting.');
    await db.resource.delete({ where: { id } });
    await audit(req.user, 'resource.delete', 'Resource', id, `Deleted resource "${x.title}"`);
    ok(res, null, { message: 'Resource deleted.' });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------- announcements
const annSchema = { title: [r.required('Enter a title.'), r.minLength(3), r.maxLength(120)], body: [r.required('Enter the announcement text.'), r.minLength(10), r.maxLength(2000)] };
exports.announcements = async (req, res, next) => {
  try { ok(res, { announcements: await db.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) }); } catch (e) { next(e); }
};
exports.createAnnouncement = async (req, res, next) => {
  try {
    const v = check(req.body, annSchema);
    const publish = req.body.status === 'PUBLISHED';
    const a = await db.announcement.create({ data: { title: v.title, body: v.body, status: publish ? 'PUBLISHED' : 'DRAFT', publishedAt: publish ? new Date() : null, authorId: req.user.id } });
    await audit(req.user, 'announcement.create', 'Announcement', a.id, `Created announcement "${a.title}" (${a.status})`);
    ok(res, { announcement: a }, { status: 201, message: publish ? 'Announcement published.' : 'Draft saved.' });
  } catch (e) { next(e); }
};
exports.updateAnnouncement = async (req, res, next) => {
  try {
    const v = check(req.body, annSchema);
    const id = uuid(req.params.id);
    const cur = await db.announcement.findUnique({ where: { id } });
    if (!cur) throw new HttpError(404, 'NOT_FOUND', 'Announcement not found.');
    const status = oneOf(req.body.status || cur.status, ['DRAFT', 'PUBLISHED'], 'status');
    const a = await db.announcement.update({ where: { id }, data: { title: v.title, body: v.body, status, publishedAt: status === 'PUBLISHED' ? cur.publishedAt || new Date() : null } });
    await audit(req.user, 'announcement.update', 'Announcement', id, `Updated announcement "${a.title}" (${a.status})`);
    ok(res, { announcement: a }, { message: 'Announcement saved.' });
  } catch (e) { next(e); }
};
exports.deleteAnnouncement = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const { count } = await db.announcement.deleteMany({ where: { id } });
    if (!count) throw new HttpError(404, 'NOT_FOUND', 'Announcement not found.');
    await audit(req.user, 'announcement.delete', 'Announcement', id, 'Deleted an announcement');
    ok(res, null, { message: 'Announcement deleted.' });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------- role requests (from the registration form)
exports.roleRequests = async (req, res, next) => {
  try {
    const status = oneOf(req.query.status, ['PENDING', 'APPROVED', 'REJECTED'], 'status') || 'PENDING';
    const rows = await db.roleRequest.findMany({ where: { status }, orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: { id: true, name: true, email: true, role: true, createdAt: true } }, decider: { select: { name: true } } } });
    ok(res, { requests: rows });
  } catch (e) { next(e); }
};

exports.decideRoleRequest = async (req, res, next) => {
  try {
    const decision = oneOf(req.body?.decision, ['approve', 'reject'], 'decision');
    if (!decision) fail({ decision: 'Choose approve or reject.' });
    const note = String(req.body?.note || '').trim().slice(0, 300);
    const rr = await db.roleRequest.findUnique({ where: { id: uuid(req.params.id) }, include: { user: true } });
    if (!rr) throw new HttpError(404, 'NOT_FOUND', 'Role request not found.');
    if (rr.status !== 'PENDING') throw new HttpError(409, 'ALREADY_DECIDED', 'This request was already decided.');
    if (rr.userId === req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You cannot decide your own request.');
    await db.$transaction(async (tx) => {
      await tx.roleRequest.update({ where: { id: rr.id }, data: { status: decision === 'approve' ? 'APPROVED' : 'REJECTED', deciderId: req.user.id, decidedAt: new Date(), note: note || null } });
      if (decision === 'approve') {
        await tx.user.update({ where: { id: rr.userId }, data: { role: rr.requestedRole } });
        await tx.session.updateMany({ where: { userId: rr.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await audit(req.user, `user.role_request.${decision}`, 'User', rr.userId, `${decision === 'approve' ? 'Approved' : 'Rejected'} ${rr.requestedRole} request from ${rr.user.email}`, { note }, tx);
    });
    await notify(rr.userId, { type: 'SYSTEM', title: decision === 'approve' ? 'Your role request was approved' : 'Your role request was declined', body: decision === 'approve' ? 'Sign in again to use your new access.' : note || undefined, link: '/dashboard' });
    ok(res, null, { message: decision === 'approve' ? 'Role approved. The user must sign in again.' : 'Request declined.' });
  } catch (e) { next(e); }
};
