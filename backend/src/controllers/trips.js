// Trip planner: user-owned itineraries with ordered items, expense tracking, sharing and collaborators.
// Access rules (enforced here, never in the UI): the owner can do everything; an EDITOR member can edit
// the plan; a VIEWER member can only read it; anyone else gets 404 so ids are not discoverable.
const crypto = require('crypto');
const db = require('../db');
const r = require('../validators/rules');
const { ok, HttpError } = require('../utils/response');
const { pageParams, text, uuid } = require('../utils/query');
const { notify } = require('../services/notify');

const tripInclude = {
  items: { orderBy: { position: 'asc' } },
  destination: { select: { id: true, slug: true, name: true, region: true } },
  owner: { select: { id: true, name: true } },
  members: { include: { user: { select: { id: true, name: true, email: true } } } }
};

function summary(trip) {
  const spent = trip.items.reduce((s, i) => s + i.estCostInr, 0);
  const days = trip.startDate && trip.endDate ? Math.round((trip.endDate - trip.startDate) / 86400000) + 1 : null;
  return { estimatedTotalInr: spent, remainingInr: trip.budgetInr == null ? null : trip.budgetInr - spent, overBudget: trip.budgetInr != null && spent > trip.budgetInr, days };
}

function shape(trip, user) {
  const member = trip.members.find((m) => m.userId === user?.id);
  const role = trip.ownerId === user?.id ? 'OWNER' : member?.role || null;
  const { shareToken, members, ...rest } = trip;
  return {
    ...rest, ...summary(trip), role,
    shared: Boolean(shareToken),
    shareToken: role === 'OWNER' ? shareToken : undefined,
    members: members.map((m) => ({ userId: m.userId, name: m.user.name, email: role === 'OWNER' ? m.user.email : undefined, role: m.role }))
  };
}

async function load(req, { need = 'read' } = {}) {
  const trip = await db.trip.findUnique({ where: { id: uuid(req.params.id) }, include: tripInclude });
  const member = trip?.members.find((m) => m.userId === req.user.id);
  const isOwner = trip?.ownerId === req.user.id;
  if (!trip || (!isOwner && !member)) throw new HttpError(404, 'NOT_FOUND', 'Trip not found.');
  if (need === 'edit' && !isOwner && member.role !== 'EDITOR') throw new HttpError(403, 'FORBIDDEN', 'You have view-only access to this trip.');
  if (need === 'owner' && !isOwner) throw new HttpError(403, 'FORBIDDEN', 'Only the trip owner can do that.');
  return trip;
}

const tripSchema = {
  title: [r.required('Give your trip a title.'), r.minLength(3), r.maxLength(80)],
  startDate: [r.pattern(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid start date.')],
  endDate: [r.pattern(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid end date.')],
  budgetInr: [r.intRange(0, 10000000, 'Budget must be a whole number of rupees.')],
  notes: [r.maxLength(1000)]
};

async function parseTrip(body) {
  const { errors, values } = r.validate(body, tripSchema);
  const d = (v) => (v ? new Date(`${v}T00:00:00Z`) : null);
  if (!errors.startDate && !errors.endDate && values.startDate && values.endDate) {
    if (d(values.endDate) < d(values.startDate)) errors.endDate = 'The end date must not be before the start date.';
    else if ((d(values.endDate) - d(values.startDate)) / 86400000 > 60) errors.endDate = 'Trips can be at most 61 days long.';
  }
  let destinationId = null;
  if (body?.destinationId) {
    destinationId = uuid(body.destinationId);
    if (!(await db.destination.findFirst({ where: { id: destinationId, published: true }, select: { id: true } }))) errors.destinationId = 'Choose a destination from the list.';
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
  return { title: values.title, startDate: d(values.startDate), endDate: d(values.endDate), budgetInr: values.budgetInr === '' || values.budgetInr === undefined ? null : Number(values.budgetInr), notes: values.notes || null, destinationId };
}

exports.list = async (req, res, next) => {
  try {
    const rows = await db.trip.findMany({ where: { OR: [{ ownerId: req.user.id }, { members: { some: { userId: req.user.id } } }] }, orderBy: { updatedAt: 'desc' }, include: tripInclude });
    ok(res, { trips: rows.map((t) => shape(t, req.user)) });
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    const data = await parseTrip(req.body);
    const count = await db.trip.count({ where: { ownerId: req.user.id } });
    if (count >= 50) throw new HttpError(400, 'LIMIT_REACHED', 'You have reached the limit of 50 trips. Delete one first.');
    const trip = await db.trip.create({ data: { ...data, ownerId: req.user.id }, include: tripInclude });
    ok(res, { trip: shape(trip, req.user) }, { status: 201, message: 'Trip created.' });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try { ok(res, { trip: shape(await load(req), req.user) }); } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const trip = await load(req, { need: 'edit' });
    const data = await parseTrip(req.body);
    const updated = await db.trip.update({ where: { id: trip.id }, data, include: tripInclude });
    ok(res, { trip: shape(updated, req.user) }, { message: 'Trip saved.' });
  } catch (e) { next(e); }
};

exports.remove = async (req, res, next) => {
  try {
    const trip = await load(req, { need: 'owner' });
    await db.trip.delete({ where: { id: trip.id } });
    ok(res, null, { message: 'Trip deleted.' });
  } catch (e) { next(e); }
};

const itemSchema = {
  title: [r.required('Every item needs a title.'), r.maxLength(100)],
  dayNumber: [r.intRange(1, 61, 'Day must be a whole number from 1 to 61.')],
  estCostInr: [r.intRange(0, 10000000, 'Cost must be a whole number of rupees.')],
  notes: [r.maxLength(300)]
};

// Replaces the whole ordered list in one transaction: this is how add, remove and reorder are saved.
exports.setItems = async (req, res, next) => {
  try {
    const trip = await load(req, { need: 'edit' });
    const list = req.body?.items;
    if (!Array.isArray(list) || list.length > 60) throw new HttpError(400, 'VALIDATION_ERROR', 'items must be a list of at most 60 entries.');
    const rows = [];
    for (let i = 0; i < list.length; i += 1) {
      const { errors, values } = r.validate(list[i], itemSchema);
      if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', `Item ${i + 1}: ${Object.values(errors)[0]}`, { [`items.${i}`]: Object.values(errors)[0] });
      let destinationId = null;
      if (list[i].destinationId) {
        destinationId = uuid(list[i].destinationId);
        if (!(await db.destination.findFirst({ where: { id: destinationId }, select: { id: true } }))) throw new HttpError(400, 'VALIDATION_ERROR', `Item ${i + 1}: unknown destination.`);
      }
      rows.push({ tripId: trip.id, position: i, title: values.title, dayNumber: Number(values.dayNumber || 1), estCostInr: Number(values.estCostInr || 0), notes: values.notes || null, destinationId });
    }
    const updated = await db.$transaction(async (tx) => {
      await tx.tripItem.deleteMany({ where: { tripId: trip.id } });
      if (rows.length) await tx.tripItem.createMany({ data: rows });
      await tx.trip.update({ where: { id: trip.id }, data: { updatedAt: new Date() } });
      return tx.trip.findUnique({ where: { id: trip.id }, include: tripInclude });
    });
    ok(res, { trip: shape(updated, req.user) }, { message: 'Itinerary saved.' });
  } catch (e) { next(e); }
};

exports.duplicate = async (req, res, next) => {
  try {
    const trip = await load(req);
    if ((await db.trip.count({ where: { ownerId: req.user.id } })) >= 50) throw new HttpError(400, 'LIMIT_REACHED', 'You have reached the limit of 50 trips.');
    const copy = await db.trip.create({
      data: {
        ownerId: req.user.id, title: `${trip.title} (copy)`.slice(0, 80), destinationId: trip.destinationId, startDate: trip.startDate, endDate: trip.endDate, budgetInr: trip.budgetInr, notes: trip.notes,
        items: { create: trip.items.map((i) => ({ position: i.position, dayNumber: i.dayNumber, title: i.title, destinationId: i.destinationId, estCostInr: i.estCostInr, notes: i.notes })) }
      },
      include: tripInclude
    });
    ok(res, { trip: shape(copy, req.user) }, { status: 201, message: 'Trip duplicated.' });
  } catch (e) { next(e); }
};

// Share links expose a read-only view and no member emails. Disabling the link invalidates it.
exports.setShare = async (req, res, next) => {
  try {
    const trip = await load(req, { need: 'owner' });
    if (typeof req.body?.enabled !== 'boolean') throw new HttpError(400, 'VALIDATION_ERROR', 'enabled must be true or false.');
    const shareToken = req.body.enabled ? (trip.shareToken || crypto.randomBytes(18).toString('base64url')) : null;
    const updated = await db.trip.update({ where: { id: trip.id }, data: { shareToken }, include: tripInclude });
    ok(res, { trip: shape(updated, req.user) });
  } catch (e) { next(e); }
};

exports.shared = async (req, res, next) => {
  try {
    const token = text(req.params.token, 60);
    const trip = token.length >= 16 ? await db.trip.findUnique({ where: { shareToken: token }, include: tripInclude }) : null;
    if (!trip) throw new HttpError(404, 'NOT_FOUND', 'This shared trip link is not valid.');
    const { members, ownerId, shareToken, ...rest } = trip;
    ok(res, { trip: { ...rest, ...summary(trip), ownerName: trip.owner.name, readOnly: true } });
  } catch (e) { next(e); }
};

exports.addMember = async (req, res, next) => {
  try {
    const trip = await load(req, { need: 'owner' });
    const { errors, values } = r.validate(req.body, { email: [r.required('Enter the email of a registered student.'), r.email()], role: [r.oneOf(['EDITOR', 'VIEWER'])] });
    if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
    const user = await db.user.findUnique({ where: { email: values.email.toLowerCase() } });
    if (!user || user.status !== 'ACTIVE') throw new HttpError(404, 'NOT_FOUND', 'No active CampusSphere account uses that email.', { email: 'No account found for this email.' });
    if (user.id === trip.ownerId) throw new HttpError(400, 'VALIDATION_ERROR', 'You already own this trip.', { email: 'You already own this trip.' });
    await db.tripMember.upsert({ where: { tripId_userId: { tripId: trip.id, userId: user.id } }, update: { role: values.role || 'EDITOR' }, create: { tripId: trip.id, userId: user.id, role: values.role || 'EDITOR' } });
    await notify(user.id, { type: 'SYSTEM', title: `${req.user.name} invited you to plan a trip`, body: trip.title, link: `/trips/${trip.id}` });
    ok(res, { trip: shape(await db.trip.findUnique({ where: { id: trip.id }, include: tripInclude }), req.user) }, { status: 201, message: 'Participant added.' });
  } catch (e) { next(e); }
};

exports.removeMember = async (req, res, next) => {
  try {
    const trip = await load(req);
    const userId = uuid(req.params.userId);
    if (trip.ownerId !== req.user.id && userId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You can only remove yourself from this trip.');
    await db.tripMember.deleteMany({ where: { tripId: trip.id, userId } });
    ok(res, null, { message: 'Participant removed.' });
  } catch (e) { next(e); }
};

module.exports.pageParams = pageParams;
