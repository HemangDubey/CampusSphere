const db = require('../db');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');

const CATEGORIES = ['TECHNICAL', 'CULTURAL', 'SPORTS', 'WORKSHOP', 'SYMPOSIUM'];
const MODES = ['IN_PERSON', 'ONLINE', 'HYBRID'];
const TRACKS = ['Paper presentation', 'Project expo', 'Quiz'];
const rules = require('../validators/rules');

function shape(event, registeredIds) {
  const { _count, ...e } = event;
  const taken = _count?.registrations ?? 0;
  return {
    ...e,
    registrationCount: taken,
    spotsLeft: e.capacity == null ? null : Math.max(e.capacity - taken, 0),
    isFull: e.capacity != null && taken >= e.capacity,
    isPast: new Date(e.startsAt) < new Date(),
    registered: registeredIds ? registeredIds.has(e.id) : false
  };
}

async function registeredSet(user, ids) {
  if (!user || !ids.length) return null;
  const rows = await db.eventRegistration.findMany({ where: { userId: user.id, eventId: { in: ids } }, select: { eventId: true } });
  return new Set(rows.map((r) => r.eventId));
}

function parseDate(value, name) {
  if (value === undefined || value === '') return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(d.getTime())) throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be a date like 2026-12-31.`);
  return d;
}

exports.list = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query);
    const q = text(req.query.q, 80);
    const category = oneOf(req.query.category, CATEGORIES, 'category');
    const mode = oneOf(req.query.mode, MODES, 'event type');
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    const where = {
      ...(category && { category }),
      ...(mode && { mode }),
      ...(q && { OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { venue: { contains: q, mode: 'insensitive' } }] }),
      startsAt: { ...(from ? { gte: from } : req.query.includePast === 'true' ? {} : { gte: new Date() }), ...(to && { lt: new Date(to.getTime() + 86400000) }) }
    };
    const [total, rows] = await Promise.all([
      db.event.count({ where }),
      db.event.findMany({ where, orderBy: { startsAt: 'asc' }, skip, take, include: { _count: { select: { registrations: true } } } })
    ]);
    const reg = await registeredSet(req.user, rows.map((r) => r.id));
    ok(res, { events: rows.map((r) => shape(r, reg)), page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.mine = async (req, res, next) => {
  try {
    const rows = await db.eventRegistration.findMany({
      where: { userId: req.user.id },
      orderBy: { event: { startsAt: 'asc' } },
      include: { event: { include: { _count: { select: { registrations: true } } } } }
    });
    const ids = new Set(rows.map((r) => r.eventId));
    ok(res, { events: rows.map((r) => ({ ...shape(r.event, ids), registeredAt: r.createdAt })) });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const event = await db.event.findUnique({ where: { id }, include: { _count: { select: { registrations: true } } } });
    if (!event) throw new HttpError(404, 'NOT_FOUND', 'Event not found.');
    ok(res, { event: shape(event, await registeredSet(req.user, [id])) });
  } catch (e) { next(e); }
};

exports.register = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const extra = {};
    // Symposium events collect a little extra information (team size and track); nothing else is stored.
    const meta = await db.event.findUnique({ where: { id }, select: { category: true } });
    if (meta?.category === 'SYMPOSIUM') {
      const { errors, values } = rules.validate(req.body, {
        teamSize: [rules.required('Enter your team size.'), rules.intRange(1, 4, 'Team size must be between 1 and 4.')],
        track: [rules.required('Choose a track.'), rules.oneOf(TRACKS)],
        consent: [rules.consent('Please confirm your details are correct.')]
      });
      if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
      extra.teamSize = Number(values.teamSize);
      extra.track = values.track;
    }
    // Serializable transaction so concurrent requests cannot oversell the last seat.
    await db.$transaction(async (tx) => {
      const event = await tx.event.findUnique({ where: { id }, include: { _count: { select: { registrations: true } } } });
      if (!event) throw new HttpError(404, 'NOT_FOUND', 'Event not found.');
      if (event.startsAt < new Date()) throw new HttpError(400, 'EVENT_PAST', 'Registration is closed because this event has started.');
      if (await tx.eventRegistration.findUnique({ where: { userId_eventId: { userId: req.user.id, eventId: id } } })) {
        throw new HttpError(409, 'ALREADY_REGISTERED', 'You are already registered for this event.');
      }
      if (event.capacity != null && event._count.registrations >= event.capacity) throw new HttpError(409, 'EVENT_FULL', 'This event is full.');
      try { await tx.eventRegistration.create({ data: { userId: req.user.id, eventId: id, ...extra } }); }
      catch (e) {
        if (e.code === 'P2002') throw new HttpError(409, 'ALREADY_REGISTERED', 'You are already registered for this event.');
        throw e;
      }
    }, { isolationLevel: 'Serializable' });
    const event = await db.event.findUnique({ where: { id }, include: { _count: { select: { registrations: true } } } });
    ok(res, { event: shape(event, new Set([id])) }, { status: 201, message: 'You are registered.' });
  } catch (e) {
    // A serialization conflict means another request took the seat first.
    if (e.code === 'P2034') return next(new HttpError(409, 'CONFLICT', 'That seat was just taken. Please try again.'));
    return next(e);
  }
};

exports.cancel = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const { count } = await db.eventRegistration.deleteMany({ where: { userId: req.user.id, eventId: id } });
    if (!count) throw new HttpError(404, 'NOT_FOUND', 'You are not registered for this event.');
    const event = await db.event.findUnique({ where: { id }, include: { _count: { select: { registrations: true } } } });
    ok(res, { event: shape(event, new Set()) }, { message: 'Registration cancelled.' });
  } catch (e) { next(e); }
};
