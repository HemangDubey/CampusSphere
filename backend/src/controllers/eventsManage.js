// Organizer and administrator event management. Mounted behind requirePermission('event:manage').
// Organizers can only touch events they organize; campus and super administrators can manage any event.
const db = require('../db');
const r = require('../validators/rules');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');
const { notifyMany } = require('../services/notify');
const { audit } = require('../services/audit');
const { CATEGORIES, MODES, shape, withCount } = require('./events');
const { isAdmin } = require('../permissions');

const manageable = (user, event) => isAdmin(user) || event.organizerId === user.id;

async function loadOwned(req) {
  const event = await db.event.findUnique({ where: { id: uuid(req.params.id) }, include: withCount });
  if (!event) throw new HttpError(404, 'NOT_FOUND', 'Event not found.');
  if (!manageable(req.user, event)) throw new HttpError(403, 'FORBIDDEN', 'You can only manage events you organize.');
  return event;
}

const schema = {
  title: [r.required('Enter a title.'), r.minLength(3), r.maxLength(120)],
  description: [r.required('Enter a description.'), r.minLength(10), r.maxLength(4000)],
  category: [r.required('Choose a category.'), r.oneOf(CATEGORIES)],
  mode: [r.required('Choose an event type.'), r.oneOf(MODES)],
  startsAt: [r.required('Enter the start date and time.'), r.dateTime()],
  endsAt: [r.dateTime()],
  venue: [r.required('Enter the venue (or "Online").'), r.minLength(2), r.maxLength(150)],
  onlineLink: [r.httpsUrl()],
  schedule: [r.maxLength(2000)],
  eligibility: [r.maxLength(500)],
  instructions: [r.maxLength(1500)],
  organizerName: [r.maxLength(80)],
  coverImage: [r.httpsUrl()],
  capacity: [r.intRange(1, 5000, 'Capacity must be a whole number from 1 to 5000.')],
  fee: [r.intRange(0, 100000, 'Fee must be a whole number from 0 to 100000.')],
  registrationOpensAt: [r.dateTime()],
  registrationClosesAt: [r.dateTime()]
};

function parse(body) {
  const { errors, values } = r.validate(body, schema);
  const d = (k) => (values[k] ? new Date(values[k]) : null);
  if (!errors.endsAt && d('endsAt') && d('startsAt') && d('endsAt') <= d('startsAt')) errors.endsAt = 'The end must be after the start.';
  if (!errors.registrationOpensAt && !errors.registrationClosesAt && d('registrationOpensAt') && d('registrationClosesAt') && d('registrationClosesAt') <= d('registrationOpensAt')) errors.registrationClosesAt = 'Registration must close after it opens.';
  if (!errors.registrationClosesAt && d('registrationClosesAt') && d('startsAt') && d('registrationClosesAt') > (d('endsAt') || d('startsAt'))) errors.registrationClosesAt = 'Registration cannot close after the event.';
  if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
  return {
    title: values.title, description: values.description, category: values.category, mode: values.mode, venue: values.venue,
    startsAt: d('startsAt'), endsAt: d('endsAt'), onlineLink: values.onlineLink || null, schedule: values.schedule || null,
    eligibility: values.eligibility || null, instructions: values.instructions || null, organizerName: values.organizerName || null,
    coverImage: values.coverImage || null, capacity: values.capacity ? Number(values.capacity) : null, fee: values.fee ? Number(values.fee) : 0,
    registrationOpensAt: d('registrationOpensAt'), registrationClosesAt: d('registrationClosesAt')
  };
}

const stats = async (id) => {
  const rows = await db.eventRegistration.groupBy({ by: ['status'], where: { eventId: id }, _count: true });
  const attended = await db.eventRegistration.count({ where: { eventId: id, status: 'REGISTERED', attended: true } });
  const by = Object.fromEntries(rows.map((x) => [x.status, x._count]));
  return { registered: by.REGISTERED || 0, cancelled: by.CANCELLED || 0, attended };
};

exports.list = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 15 });
    const q = text(req.query.q, 80);
    const status = oneOf(req.query.status, ['DRAFT', 'PUBLISHED', 'CANCELLED'], 'status');
    const where = { ...(isAdmin(req.user) ? {} : { organizerId: req.user.id }), ...(status && { status }), ...(q && { title: { contains: q, mode: 'insensitive' } }) };
    const [total, rows] = await Promise.all([db.event.count({ where }), db.event.findMany({ where, orderBy: { startsAt: 'desc' }, skip, take, include: withCount })]);
    ok(res, { events: rows.map((e) => shape(e)), page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const event = await loadOwned(req);
    ok(res, { event: shape(event), stats: await stats(event.id) });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const data = parse(req.body);
    if (data.startsAt <= new Date()) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { startsAt: 'Choose a start time in the future.' });
    const event = await db.event.create({ data: { ...data, status: 'DRAFT', isDemo: false, organizerId: req.user.id, organizerName: data.organizerName || req.user.name } });
    await audit(req.user, 'event.create', 'Event', event.id, `Created draft event "${event.title}"`);
    ok(res, { event: shape(event) }, { status: 201, message: 'Draft saved.' });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const event = await loadOwned(req);
    if (event.status === 'CANCELLED') throw new HttpError(409, 'INVALID_STATE', 'A cancelled event cannot be edited.');
    const data = parse(req.body);
    if (data.capacity != null && data.capacity < event._count.registrations) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { capacity: `Capacity cannot be lower than the ${event._count.registrations} current registrations.` });
    }
    const updated = await db.event.update({ where: { id: event.id }, data, include: withCount });
    await audit(req.user, 'event.update', 'Event', event.id, `Edited event "${updated.title}"`);
    ok(res, { event: shape(updated) }, { message: 'Event saved.' });
  } catch (e) { next(e); }
};

exports.publish = async (req, res, next) => {
  try {
    const event = await loadOwned(req);
    if (event.status !== 'DRAFT') throw new HttpError(409, 'INVALID_STATE', 'Only a draft can be published.');
    if (event.startsAt <= new Date()) throw new HttpError(400, 'INVALID_STATE', 'This event has already started; edit the date before publishing.');
    const updated = await db.event.update({ where: { id: event.id }, data: { status: 'PUBLISHED' }, include: withCount });
    await audit(req.user, 'event.publish', 'Event', event.id, `Published event "${event.title}"`);
    ok(res, { event: shape(updated) }, { message: 'Event published.' });
  } catch (e) { next(e); }
};

exports.unpublish = async (req, res, next) => {
  try {
    const event = await loadOwned(req);
    if (event.status !== 'PUBLISHED') throw new HttpError(409, 'INVALID_STATE', 'Only a published event can be unpublished.');
    if (event._count.registrations > 0) throw new HttpError(409, 'INVALID_STATE', 'This event has registrations. Cancel it instead of unpublishing.');
    const updated = await db.event.update({ where: { id: event.id }, data: { status: 'DRAFT' }, include: withCount });
    await audit(req.user, 'event.unpublish', 'Event', event.id, `Unpublished event "${event.title}"`);
    ok(res, { event: shape(updated) }, { message: 'Event moved back to draft.' });
  } catch (e) { next(e); }
};

exports.cancel = async (req, res, next) => {
  try {
    const event = await loadOwned(req);
    if (event.status === 'CANCELLED') throw new HttpError(409, 'INVALID_STATE', 'This event is already cancelled.');
    const reason = text(req.body?.reason, 500);
    if (reason.length < 5) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { reason: 'Give a reason (at least 5 characters).' });
    const regs = await db.eventRegistration.findMany({ where: { eventId: event.id, status: 'REGISTERED' }, select: { userId: true } });
    const updated = await db.event.update({ where: { id: event.id }, data: { status: 'CANCELLED', cancelReason: reason }, include: withCount });
    await notifyMany(regs.map((x) => x.userId), { type: 'EVENT', title: `Event cancelled: ${event.title}`, body: reason, link: `/events/${event.id}` });
    await audit(req.user, 'event.cancel', 'Event', event.id, `Cancelled event "${event.title}"`, { reason, notified: regs.length });
    ok(res, { event: shape(updated) }, { message: `Event cancelled. ${regs.length} attendee${regs.length === 1 ? '' : 's'} notified.` });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const event = await loadOwned(req);
    if (event.status !== 'DRAFT') throw new HttpError(409, 'INVALID_STATE', 'Only drafts can be deleted. Cancel a published event instead.');
    await db.event.delete({ where: { id: event.id } });
    await audit(req.user, 'event.delete', 'Event', event.id, `Deleted draft event "${event.title}"`);
    ok(res, null, { message: 'Draft deleted.' });
  } catch (e) { next(e); }
};

function regWhere(req, event) {
  const q = text(req.query.q, 80);
  const status = oneOf(req.query.status, ['REGISTERED', 'CANCELLED'], 'status');
  const attended = oneOf(req.query.attended, ['true', 'false'], 'attended');
  return {
    eventId: event.id, ...(status && { status }), ...(attended && { attended: attended === 'true' }),
    ...(q && { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { registrationNo: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { referenceNo: { contains: q, mode: 'insensitive' } }] })
  };
}

exports.registrations = async (req, res, next) => {
  try {
    const event = await loadOwned(req);
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 25, maxSize: 100 });
    const where = regWhere(req, event);
    const [total, rows] = await Promise.all([db.eventRegistration.count({ where }), db.eventRegistration.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take })]);
    ok(res, { registrations: rows, stats: await stats(event.id), capacity: event.capacity, page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.attendance = async (req, res, next) => {
  try {
    const event = await loadOwned(req);
    const attended = req.body?.attended;
    if (typeof attended !== 'boolean') throw new HttpError(400, 'VALIDATION_ERROR', 'attended must be true or false.');
    const reg = await db.eventRegistration.findFirst({ where: { id: uuid(req.params.regId), eventId: event.id } });
    if (!reg) throw new HttpError(404, 'NOT_FOUND', 'Registration not found.');
    if (reg.status !== 'REGISTERED') throw new HttpError(409, 'INVALID_STATE', 'Cancelled registrations cannot be marked.');
    const updated = await db.eventRegistration.update({ where: { id: reg.id }, data: { attended, attendedAt: attended ? new Date() : null } });
    ok(res, { registration: updated, stats: await stats(event.id) });
  } catch (e) { next(e); }
};

// CSV cells beginning with = + - @ are prefixed so spreadsheet software cannot run them as formulas.
const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

exports.exportCsv = async (req, res, next) => {
  try {
    const event = await loadOwned(req);
    const rows = await db.eventRegistration.findMany({ where: regWhere(req, event), orderBy: { createdAt: 'asc' } });
    const head = ['Reference', 'Full name', 'Registration no', 'Email', 'Department', 'Year', 'Team size', 'Track', 'Status', 'Attended', 'Registered at'];
    const lines = [head.map(cell).join(',')].concat(rows.map((x) => [x.referenceNo, x.fullName, x.registrationNo, x.email, x.department, x.yearOfStudy, x.teamSize, x.track, x.status, x.attended ? 'yes' : 'no', x.createdAt.toISOString()].map(cell).join(',')));
    await audit(req.user, 'event.export', 'Event', event.id, `Exported ${rows.length} registrations for "${event.title}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
    res.send(`${lines.join('\r\n')}\r\n`);
  } catch (e) { next(e); }
};
