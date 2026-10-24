const db = require('../db');
const r = require('../validators/rules');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');
const { withRef } = require('../utils/ref');
const { notify } = require('../services/notify');

const CATEGORIES = ['TECHNICAL', 'CULTURAL', 'SPORTS', 'WORKSHOP', 'SYMPOSIUM'];
const MODES = ['IN_PERSON', 'ONLINE', 'HYBRID'];
const TRACKS = ['Paper presentation', 'Project expo', 'Quiz'];
const CANCEL_CUTOFF_MS = 0; // students may cancel until the event starts

// The reasons a student cannot register right now, evaluated on the server for every request.
function registrationState(event, registered, taken, now = new Date()) {
  const opens = event.registrationOpensAt;
  const closes = event.registrationClosesAt || event.startsAt;
  if (event.status === 'CANCELLED') return { open: false, reason: 'This event has been cancelled.' };
  if (event.status !== 'PUBLISHED') return { open: false, reason: 'This event is not open for registration.' };
  if (registered) return { open: false, reason: 'You are registered for this event.' };
  if (event.endsAt ? event.endsAt < now : event.startsAt < now) return { open: false, reason: 'This event has ended.' };
  if (opens && opens > now) return { open: false, reason: `Registration opens ${opens.toISOString()}.`, opensAt: opens };
  if (closes < now) return { open: false, reason: 'Registration has closed.' };
  if (event.capacity != null && taken >= event.capacity) return { open: false, reason: 'This event is full.' };
  return { open: true };
}

function timing(event, now = new Date()) {
  const end = event.endsAt || new Date(event.startsAt.getTime() + 3 * 3600 * 1000);
  if (event.startsAt > now) return 'upcoming';
  return end >= now ? 'ongoing' : 'past';
}

function shape(event, ctx = {}) {
  const { _count, organizer, ...e } = event;
  const taken = _count?.registrations ?? ctx.taken ?? 0;
  const mine = ctx.mine || null;
  const reg = registrationState(event, Boolean(mine && mine.status === 'REGISTERED'), taken);
  return {
    ...e,
    organizerDisplay: organizer?.name || e.organizerName || null,
    registrationCount: taken,
    spotsLeft: e.capacity == null ? null : Math.max(e.capacity - taken, 0),
    isFull: e.capacity != null && taken >= e.capacity,
    timing: timing(event),
    registered: Boolean(mine && mine.status === 'REGISTERED'),
    myRegistration: mine ? { id: mine.id, referenceNo: mine.referenceNo, status: mine.status, createdAt: mine.createdAt } : null,
    registrationOpen: reg.open,
    registrationNote: reg.reason || null,
    canCancel: Boolean(mine && mine.status === 'REGISTERED' && event.status !== 'CANCELLED' && event.startsAt.getTime() - CANCEL_CUTOFF_MS > Date.now())
  };
}

const withCount = { _count: { select: { registrations: { where: { status: 'REGISTERED' } } } }, organizer: { select: { name: true } } };

async function myRegs(user, ids) {
  if (!user || !ids.length) return new Map();
  const rows = await db.eventRegistration.findMany({ where: { userId: user.id, eventId: { in: ids } } });
  return new Map(rows.map((x) => [x.eventId, x]));
}

function parseDate(value, name) {
  if (value === undefined || value === '') return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(d.getTime())) throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be a date like 2026-12-31.`);
  return d;
}

exports.list = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 9 });
    const q = text(req.query.q, 80);
    const category = oneOf(req.query.category, CATEGORIES, 'category');
    const mode = oneOf(req.query.mode, MODES, 'event type');
    const when = oneOf(req.query.when, ['upcoming', 'ongoing', 'past', 'all'], 'time filter') || 'upcoming';
    const sort = oneOf(req.query.sort, ['date', 'relevance', 'popular'], 'sort') || 'date';
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    const now = new Date();
    const AND = [{ status: 'PUBLISHED' }];
    if (category) AND.push({ category });
    if (mode) AND.push({ mode });
    if (q) AND.push({ OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { venue: { contains: q, mode: 'insensitive' } }, { organizerName: { contains: q, mode: 'insensitive' } }, { organizer: { name: { contains: q, mode: 'insensitive' } } }] });
    if (when === 'upcoming') AND.push({ startsAt: { gt: now } });
    if (when === 'past') AND.push({ OR: [{ endsAt: { lt: now } }, { endsAt: null, startsAt: { lt: new Date(now.getTime() - 3 * 3600 * 1000) } }] });
    if (when === 'ongoing') AND.push({ startsAt: { lte: now } }, { OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: new Date(now.getTime() - 3 * 3600 * 1000) } }] });
    if (from) AND.push({ startsAt: { gte: from } });
    if (to) AND.push({ startsAt: { lt: new Date(to.getTime() + 86400000) } });
    const where = { AND };
    const orderBy = sort === 'popular' ? [{ registrations: { _count: 'desc' } }, { startsAt: 'asc' }] : [{ startsAt: when === 'past' ? 'desc' : 'asc' }];
    const [total, rows] = await Promise.all([db.event.count({ where }), db.event.findMany({ where, orderBy, skip, take, include: withCount })]);
    // "relevance" ranks title matches before description-only matches within the fetched page.
    if (sort === 'relevance' && q) rows.sort((a, b) => Number(b.title.toLowerCase().includes(q.toLowerCase())) - Number(a.title.toLowerCase().includes(q.toLowerCase())));
    const mine = await myRegs(req.user, rows.map((x) => x.id));
    ok(res, { events: rows.map((e) => shape(e, { mine: mine.get(e.id) })), page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.mine = async (req, res, next) => {
  try {
    const rows = await db.eventRegistration.findMany({
      where: { userId: req.user.id }, orderBy: { event: { startsAt: 'asc' } },
      include: { event: { include: withCount } }
    });
    ok(res, { registrations: rows.map((x) => ({ ...x, event: shape(x.event, { mine: x }) })) });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const event = await db.event.findUnique({ where: { id }, include: withCount });
    const privileged = req.user && (req.user.id === event?.organizerId || ['CAMPUS_ADMIN', 'SUPER_ADMIN'].includes(req.user.role));
    if (!event || (event.status === 'DRAFT' && !privileged)) throw new HttpError(404, 'NOT_FOUND', 'Event not found.');
    const mine = (await myRegs(req.user, [id])).get(id);
    const related = await db.event.findMany({
      where: { status: 'PUBLISHED', id: { not: id }, startsAt: { gt: new Date() }, category: event.category },
      orderBy: { startsAt: 'asc' }, take: 3, include: withCount
    });
    ok(res, { event: shape(event, { mine }), related: related.map((x) => shape(x)) });
  } catch (e) { next(e); }
};

const registerSchema = (event) => ({
  fullName: [r.required('Enter your full name.'), r.minLength(2), r.maxLength(80)],
  registrationNo: [r.required('Enter your university registration number.'), r.pattern(/^[A-Za-z0-9/-]{4,20}$/, 'Use 4 to 20 letters, numbers, dashes or slashes.')],
  email: [r.required('Enter your email.'), r.email()],
  department: [r.required('Enter your department.'), r.maxLength(80)],
  yearOfStudy: [r.required('Enter your year of study.'), r.intRange(1, 8)],
  ...(event.category === 'SYMPOSIUM' ? {
    teamSize: [r.required('Enter your team size.'), r.intRange(1, 4, 'Team size must be between 1 and 4.')],
    track: [r.required('Choose a track.'), r.oneOf(TRACKS)]
  } : {}),
  consent: [r.consent('Please confirm your details are correct.')]
});

exports.register = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const meta = await db.event.findUnique({ where: { id }, select: { category: true } });
    if (!meta) throw new HttpError(404, 'NOT_FOUND', 'Event not found.');
    const { errors, values } = r.validate(req.body, registerSchema(meta));
    if (req.body?.confirm !== true) errors.confirm = 'Please review and confirm your registration.';
    if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);

    // Serializable transaction so concurrent requests cannot oversell the last seat.
    const registration = await db.$transaction(async (tx) => {
      const event = await tx.event.findUnique({ where: { id }, include: withCount });
      if (!event) throw new HttpError(404, 'NOT_FOUND', 'Event not found.');
      const existing = await tx.eventRegistration.findUnique({ where: { userId_eventId: { userId: req.user.id, eventId: id } } });
      if (existing?.status === 'REGISTERED') throw new HttpError(409, 'ALREADY_REGISTERED', 'You are already registered for this event.');
      const state = registrationState(event, false, event._count.registrations);
      if (!state.open) throw new HttpError(state.reason === 'This event is full.' ? 409 : 400, state.reason === 'This event is full.' ? 'EVENT_FULL' : 'REGISTRATION_CLOSED', state.reason);
      const data = {
        fullName: values.fullName, registrationNo: values.registrationNo, email: values.email.toLowerCase(), department: values.department,
        yearOfStudy: Number(values.yearOfStudy), teamSize: values.teamSize ? Number(values.teamSize) : null, track: values.track || null
      };
      if (existing) {
        // Re-registering after a cancellation re-activates the same record and keeps its reference number.
        return tx.eventRegistration.update({ where: { id: existing.id }, data: { ...data, status: 'REGISTERED', cancelledAt: null, attended: false, attendedAt: null } });
      }
      return withRef('REG', (referenceNo) => tx.eventRegistration.create({ data: { ...data, referenceNo, userId: req.user.id, eventId: id } }));
    }, { isolationLevel: 'Serializable' });

    const event = await db.event.findUnique({ where: { id }, include: withCount });
    await notify(req.user.id, { type: 'EVENT', title: `Registered: ${event.title}`, body: `Reference ${registration.referenceNo}`, link: `/events/${id}` });
    ok(res, { registration, event: shape(event, { mine: registration }) }, { status: 201, message: 'Registration confirmed.' });
  } catch (e) {
    if (e.code === 'P2034') return next(new HttpError(409, 'CONFLICT', 'That seat was just taken. Please try again.'));
    return next(e);
  }
};

exports.cancel = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    const reg = await db.eventRegistration.findUnique({ where: { userId_eventId: { userId: req.user.id, eventId: id } }, include: { event: true } });
    if (!reg || reg.status !== 'REGISTERED') throw new HttpError(404, 'NOT_FOUND', 'You are not registered for this event.');
    if (reg.event.status !== 'CANCELLED' && reg.event.startsAt.getTime() - CANCEL_CUTOFF_MS <= Date.now()) {
      throw new HttpError(400, 'CANCELLATION_CLOSED', 'This event has started, so the registration can no longer be cancelled.');
    }
    const updated = await db.eventRegistration.update({ where: { id: reg.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    await notify(req.user.id, { type: 'EVENT', title: `Registration cancelled: ${reg.event.title}`, body: `Reference ${reg.referenceNo}`, link: `/events/${id}` });
    const event = await db.event.findUnique({ where: { id }, include: withCount });
    ok(res, { registration: updated, event: shape(event, { mine: updated }) }, { message: 'Registration cancelled.' });
  } catch (e) { next(e); }
};

module.exports.shape = shape;
module.exports.withCount = withCount;
module.exports.CATEGORIES = CATEGORIES;
module.exports.MODES = MODES;
