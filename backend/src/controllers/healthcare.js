// Healthcare (demonstration): services, providers, slots, appointment requests and administrator review.
// Nothing here is connected to a real clinic. Slot booking is real database state with double-booking prevention.
const db = require('../db');
const r = require('../validators/rules');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');
const { withRef } = require('../utils/ref');
const { notify } = require('../services/notify');
const { recordStatus, timeline } = require('../services/history');
const { audit } = require('../services/audit');

const NOTICE = 'Appointment requests are recorded in CampusSphere and are not sent to a hospital or clinic. This is not a medical or diagnosis service. In an emergency call your local emergency number (112 in India).';
const ACTIVE = ['REQUESTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED'];
const ADMIN_TRANSITIONS = {
  REQUESTED: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  RESCHEDULE_REQUESTED: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED']
};
const REASON_REQUIRED = ['REJECTED', 'CANCELLED'];

const apptInclude = {
  service: { select: { id: true, name: true } },
  provider: { select: { id: true, name: true, speciality: true } },
  slot: { select: { id: true, startsAt: true, endsAt: true } },
  user: { select: { id: true, name: true } }
};

// ---------------------------------------------------------------- directory
exports.info = (req, res) => ok(res, { notice: NOTICE, demo: true });

exports.services = async (req, res, next) => {
  try {
    const q = text(req.query.q, 60);
    const category = text(req.query.category, 60);
    const rows = await db.healthService.findMany({
      where: { published: true, ...(category && { category }), ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { providers: { some: { name: { contains: q, mode: 'insensitive' } } } }] }) },
      orderBy: { name: 'asc' },
      include: { providers: { where: { published: true }, orderBy: { name: 'asc' }, include: { _count: { select: { slots: { where: { status: 'OPEN', startsAt: { gt: new Date() } } } } } } } }
    });
    const categories = [...new Set((await db.healthService.findMany({ where: { published: true }, select: { category: true } })).map((s) => s.category))].sort();
    ok(res, { services: rows.map((s) => ({ ...s, providers: s.providers.map(({ _count, ...p }) => ({ ...p, openSlots: _count.slots })) })), categories, notice: NOTICE });
  } catch (e) { next(e); }
};

exports.provider = async (req, res, next) => {
  try {
    const p = await db.healthProvider.findFirst({ where: { id: uuid(req.params.id), published: true, service: { published: true } }, include: { service: { select: { id: true, name: true } } } });
    if (!p) throw new HttpError(404, 'NOT_FOUND', 'Provider not found.');
    const slots = await db.healthSlot.findMany({ where: { providerId: p.id, status: 'OPEN', startsAt: { gt: new Date(), lt: new Date(Date.now() + 21 * 86400000) } }, orderBy: { startsAt: 'asc' }, take: 200 });
    ok(res, { provider: p, slots });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------- student appointments
const schema = {
  patientName: [r.required('Enter the patient name.'), r.minLength(2), r.maxLength(80)],
  phone: [r.required('Enter a contact number.'), r.phoneIN()],
  reason: [r.required('Briefly describe the reason for the visit.'), r.minLength(5), r.maxLength(300)],
  consent: [r.consent('Please confirm you understand how this request works.')]
};

// Students never get the phone number back (they typed it); administrators need it to contact the patient.
const shape = (a) => { const { phone, ...rest } = a; return { ...rest, demo: true }; };
const shapeAdmin = (a) => ({ ...a, demo: true });

async function claimSlot(tx, slotId, provider) {
  const slot = await tx.healthSlot.findUnique({ where: { id: slotId } });
  if (!slot || slot.providerId !== provider.id) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a time slot from the list.', { slotId: 'Choose a time slot from the list.' });
  if (slot.startsAt <= new Date()) throw new HttpError(409, 'SLOT_UNAVAILABLE', 'That time has passed. Please choose another slot.', { slotId: 'That time has passed.' });
  // Compare-and-set: only one concurrent request can flip OPEN -> BOOKED.
  const { count } = await tx.healthSlot.updateMany({ where: { id: slotId, status: 'OPEN' }, data: { status: 'BOOKED' } });
  if (!count) throw new HttpError(409, 'SLOT_UNAVAILABLE', 'That slot is no longer available. Please choose another.', { slotId: 'That slot was just taken.' });
  return slot;
}

async function freeSlot(tx, slotId) {
  if (slotId) await tx.healthSlot.updateMany({ where: { id: slotId, status: 'BOOKED' }, data: { status: 'OPEN' } });
}

exports.create = async (req, res, next) => {
  try {
    const { errors, values } = r.validate(req.body, schema);
    if (!req.body?.serviceId) errors.serviceId = 'Choose a service.';
    if (req.body?.confirm !== true) errors.confirm = 'Please review and confirm your request.';
    if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
    const service = await db.healthService.findFirst({ where: { id: uuid(req.body.serviceId), published: true } });
    if (!service) throw new HttpError(404, 'NOT_FOUND', 'Service not found.');
    let provider = null;
    if (req.body.providerId) {
      provider = await db.healthProvider.findFirst({ where: { id: uuid(req.body.providerId), serviceId: service.id, published: true } });
      if (!provider) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a provider for this service.', { providerId: 'Choose a provider for this service.' });
    }
    if (req.body.slotId && !provider) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a provider to book a slot.', { providerId: 'Choose a provider to book a slot.' });
    if (provider && !req.body.slotId && (await db.healthSlot.count({ where: { providerId: provider.id, status: 'OPEN', startsAt: { gt: new Date() } } })) > 0) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Choose one of the available time slots.', { slotId: 'Choose one of the available time slots.' });
    }
    if ((await db.appointment.count({ where: { userId: req.user.id, status: { in: ACTIVE } } })) >= 5) throw new HttpError(409, 'LIMIT_REACHED', 'You already have 5 active appointment requests. Cancel one first.');

    const appt = await db.$transaction(async (tx) => {
      if (req.body.slotId) await claimSlot(tx, uuid(req.body.slotId), provider);
      const created = await withRef('APT', (referenceNo) => tx.appointment.create({
        data: { referenceNo, userId: req.user.id, serviceId: service.id, providerId: provider?.id || null, slotId: req.body.slotId || null, patientName: values.patientName, phone: values.phone.replace(/[\s-]/g, ''), reason: values.reason },
        include: apptInclude
      }));
      await recordStatus('APPOINTMENT', created.id, req.user, null, 'REQUESTED', 'Request submitted', tx);
      return created;
    }, { isolationLevel: 'Serializable' });
    await notify(req.user.id, { type: 'APPOINTMENT', title: 'Appointment request submitted', body: `Reference ${appt.referenceNo}`, link: `/appointments` });
    ok(res, { appointment: shape(appt) }, { status: 201, message: 'Request recorded. It is not a confirmed clinic appointment.' });
  } catch (e) {
    if (e.code === 'P2034' || (e.code === 'P2002' && String(e.meta?.target || '').includes('slotId'))) return next(new HttpError(409, 'SLOT_UNAVAILABLE', 'That slot was just taken. Please choose another.', { slotId: 'That slot was just taken.' }));
    return next(e);
  }
};

exports.mine = async (req, res, next) => {
  try {
    const rows = await db.appointment.findMany({ where: { userId: req.user.id }, include: apptInclude, orderBy: { createdAt: 'desc' } });
    ok(res, { appointments: rows.map(shape) });
  } catch (e) { next(e); }
};

async function loadOwn(req) {
  const a = await db.appointment.findFirst({ where: { id: uuid(req.params.id), userId: req.user.id }, include: apptInclude });
  if (!a) throw new HttpError(404, 'NOT_FOUND', 'Appointment not found.');
  return a;
}

exports.getOne = async (req, res, next) => {
  try {
    const a = await loadOwn(req);
    ok(res, { appointment: shape(a), history: await timeline('APPOINTMENT', a.id) });
  } catch (e) { next(e); }
};

exports.cancel = async (req, res, next) => {
  try {
    const a = await loadOwn(req);
    if (!ACTIVE.includes(a.status)) throw new HttpError(409, 'INVALID_STATE', 'This appointment can no longer be cancelled.');
    const reason = text(req.body?.reason, 300);
    const updated = await db.$transaction(async (tx) => {
      await freeSlot(tx, a.slotId);
      const u = await tx.appointment.update({ where: { id: a.id }, data: { status: 'CANCELLED', slotId: null }, include: apptInclude });
      await recordStatus('APPOINTMENT', a.id, req.user, a.status, 'CANCELLED', reason || 'Cancelled by student', tx);
      return u;
    });
    ok(res, { appointment: shape(updated) }, { message: 'Appointment request cancelled.' });
  } catch (e) { next(e); }
};

exports.reschedule = async (req, res, next) => {
  try {
    const a = await loadOwn(req);
    if (!['REQUESTED', 'CONFIRMED'].includes(a.status)) throw new HttpError(409, 'INVALID_STATE', 'Only requested or confirmed appointments can be rescheduled.');
    if (!a.providerId) throw new HttpError(400, 'INVALID_STATE', 'This request has no provider, so there are no slots to move to.');
    const reason = text(req.body?.reason, 300);
    if (reason.length < 5) throw new HttpError(400, 'VALIDATION_ERROR', 'Please give a reason (at least 5 characters).', { reason: 'Please give a reason (at least 5 characters).' });
    const newSlotId = uuid(req.body?.slotId);
    if (newSlotId === a.slotId) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a different slot.', { slotId: 'Choose a different slot.' });
    const provider = await db.healthProvider.findUnique({ where: { id: a.providerId } });
    const updated = await db.$transaction(async (tx) => {
      await claimSlot(tx, newSlotId, provider);
      await freeSlot(tx, a.slotId);
      await tx.appointment.update({ where: { id: a.id }, data: { slotId: null } }); // release the unique slot link before re-pointing
      const u = await tx.appointment.update({ where: { id: a.id }, data: { slotId: newSlotId, status: 'RESCHEDULE_REQUESTED' }, include: apptInclude });
      await recordStatus('APPOINTMENT', a.id, req.user, a.status, 'RESCHEDULE_REQUESTED', reason, tx);
      return u;
    }, { isolationLevel: 'Serializable' });
    await notify(req.user.id, { type: 'APPOINTMENT', title: 'Reschedule requested', body: `Reference ${a.referenceNo}`, link: '/appointments' });
    ok(res, { appointment: shape(updated) }, { message: 'Reschedule request sent for review.' });
  } catch (e) {
    if (e.code === 'P2034') return next(new HttpError(409, 'SLOT_UNAVAILABLE', 'That slot was just taken. Please choose another.', { slotId: 'That slot was just taken.' }));
    return next(e);
  }
};

// ---------------------------------------------------------------- healthcare administrators
exports.adminList = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 20 });
    const status = oneOf(req.query.status, ['REQUESTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'COMPLETED', 'CANCELLED', 'REJECTED'], 'status');
    const q = text(req.query.q, 60);
    const date = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? new Date(`${req.query.date}T00:00:00Z`) : undefined;
    const where = {
      ...(status && { status }),
      ...(date && { slot: { startsAt: { gte: date, lt: new Date(date.getTime() + 86400000) } } }),
      ...(q && { OR: [{ referenceNo: { contains: q, mode: 'insensitive' } }, { patientName: { contains: q, mode: 'insensitive' } }, { service: { name: { contains: q, mode: 'insensitive' } } }] })
    };
    const [total, rows, counts] = await Promise.all([
      db.appointment.count({ where }), db.appointment.findMany({ where, include: apptInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      db.appointment.groupBy({ by: ['status'], _count: true })
    ]);
    ok(res, { appointments: rows.map(shapeAdmin), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])), page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.adminGet = async (req, res, next) => {
  try {
    const a = await db.appointment.findUnique({ where: { id: uuid(req.params.id) }, include: apptInclude });
    if (!a) throw new HttpError(404, 'NOT_FOUND', 'Appointment not found.');
    ok(res, { appointment: shapeAdmin(a), history: await timeline('APPOINTMENT', a.id) });
  } catch (e) { next(e); }
};

exports.adminTransition = async (req, res, next) => {
  try {
    const a = await db.appointment.findUnique({ where: { id: uuid(req.params.id) }, include: apptInclude });
    if (!a) throw new HttpError(404, 'NOT_FOUND', 'Appointment not found.');
    const to = req.body?.to;
    if (!(ADMIN_TRANSITIONS[a.status] || []).includes(to)) throw new HttpError(409, 'INVALID_TRANSITION', `A ${a.status.toLowerCase().replace('_', ' ')} appointment cannot move to ${String(to).toLowerCase().replace('_', ' ')}.`);
    const note = text(req.body?.note, 300);
    if (REASON_REQUIRED.includes(to) && note.length < 5) throw new HttpError(400, 'VALIDATION_ERROR', 'Please record a reason (at least 5 characters).', { note: 'Please record a reason (at least 5 characters).' });
    const updated = await db.$transaction(async (tx) => {
      const release = REASON_REQUIRED.includes(to);
      if (release) await freeSlot(tx, a.slotId);
      const u = await tx.appointment.update({ where: { id: a.id }, data: { status: to, adminNote: note || a.adminNote, ...(release && { slotId: null }) }, include: apptInclude });
      await recordStatus('APPOINTMENT', a.id, req.user, a.status, to, note, tx);
      return u;
    });
    await notify(a.userId, { type: 'APPOINTMENT', title: `Appointment ${to.toLowerCase().replace('_', ' ')} `, body: note || a.referenceNo, link: '/appointments' });
    await audit(req.user, `appointment.${to.toLowerCase()}`, 'Appointment', a.id, `Appointment ${a.referenceNo} ${a.status} -> ${to}`, { note });
    ok(res, { appointment: shapeAdmin(updated) }, { message: 'Status updated.' });
  } catch (e) { next(e); }
};

// ---- services, providers and slots (CRUD)
const serviceSchema = { name: [r.required('Enter a name.'), r.minLength(3), r.maxLength(80)], category: [r.required('Enter a category.'), r.maxLength(60)], description: [r.required('Enter a description.'), r.minLength(10), r.maxLength(600)] };
const providerSchema = { serviceId: [r.required('Choose a service.')], name: [r.required('Enter a name.'), r.minLength(3), r.maxLength(80)], speciality: [r.required('Enter a speciality.'), r.maxLength(80)], bio: [r.maxLength(600)] };
const fail = (errors) => { throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors); };

exports.adminServices = async (req, res, next) => {
  try {
    const rows = await db.healthService.findMany({ orderBy: { name: 'asc' }, include: { providers: { orderBy: { name: 'asc' }, include: { _count: { select: { slots: { where: { status: 'OPEN', startsAt: { gt: new Date() } } } } } } } } });
    ok(res, { services: rows });
  } catch (e) { next(e); }
};

exports.createService = async (req, res, next) => {
  try {
    const { errors, values } = r.validate(req.body, serviceSchema);
    if (Object.keys(errors).length) fail(errors);
    const s = await db.healthService.create({ data: { name: values.name, category: values.category, description: values.description, published: req.body.published !== false, isDemo: false } });
    await audit(req.user, 'healthcare.service.create', 'HealthService', s.id, `Created service "${s.name}"`);
    ok(res, { service: s }, { status: 201, message: 'Service created.' });
  } catch (e) { next(e); }
};

exports.updateService = async (req, res, next) => {
  try {
    const { errors, values } = r.validate(req.body, serviceSchema);
    if (Object.keys(errors).length) fail(errors);
    const s = await db.healthService.update({ where: { id: uuid(req.params.id) }, data: { name: values.name, category: values.category, description: values.description, published: req.body.published !== false } }).catch((e) => { throw e.code === 'P2025' ? new HttpError(404, 'NOT_FOUND', 'Service not found.') : e; });
    await audit(req.user, 'healthcare.service.update', 'HealthService', s.id, `Updated service "${s.name}"${s.published ? '' : ' (unpublished)'}`);
    ok(res, { service: s }, { message: 'Service saved.' });
  } catch (e) { next(e); }
};

exports.deleteService = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (await db.appointment.count({ where: { serviceId: id } })) throw new HttpError(409, 'IN_USE', 'This service has appointment history. Unpublish it instead of deleting.');
    const { count } = await db.healthService.deleteMany({ where: { id } });
    if (!count) throw new HttpError(404, 'NOT_FOUND', 'Service not found.');
    await audit(req.user, 'healthcare.service.delete', 'HealthService', id, 'Deleted a service');
    ok(res, null, { message: 'Service deleted.' });
  } catch (e) { next(e); }
};

exports.createProvider = async (req, res, next) => {
  try {
    const { errors, values } = r.validate(req.body, providerSchema);
    if (Object.keys(errors).length) fail(errors);
    if (!(await db.healthService.findUnique({ where: { id: uuid(values.serviceId) } }))) fail({ serviceId: 'Choose a service.' });
    const p = await db.healthProvider.create({ data: { serviceId: values.serviceId, name: values.name, speciality: values.speciality, bio: values.bio || null, published: req.body.published !== false, isDemo: false } });
    await audit(req.user, 'healthcare.provider.create', 'HealthProvider', p.id, `Created provider "${p.name}"`);
    ok(res, { provider: p }, { status: 201, message: 'Provider created.' });
  } catch (e) { next(e); }
};

exports.updateProvider = async (req, res, next) => {
  try {
    const { errors, values } = r.validate(req.body, providerSchema);
    if (Object.keys(errors).length) fail(errors);
    const p = await db.healthProvider.update({ where: { id: uuid(req.params.id) }, data: { serviceId: values.serviceId, name: values.name, speciality: values.speciality, bio: values.bio || null, published: req.body.published !== false } }).catch((e) => { throw e.code === 'P2025' ? new HttpError(404, 'NOT_FOUND', 'Provider not found.') : e; });
    await audit(req.user, 'healthcare.provider.update', 'HealthProvider', p.id, `Updated provider "${p.name}"`);
    ok(res, { provider: p }, { message: 'Provider saved.' });
  } catch (e) { next(e); }
};

exports.deleteProvider = async (req, res, next) => {
  try {
    const id = uuid(req.params.id);
    if (await db.appointment.count({ where: { providerId: id, status: { in: ACTIVE } } })) throw new HttpError(409, 'IN_USE', 'This provider has active appointments.');
    const { count } = await db.healthProvider.deleteMany({ where: { id } });
    if (!count) throw new HttpError(404, 'NOT_FOUND', 'Provider not found.');
    await audit(req.user, 'healthcare.provider.delete', 'HealthProvider', id, 'Deleted a provider');
    ok(res, null, { message: 'Provider deleted.' });
  } catch (e) { next(e); }
};

// Generates one-day availability: startTime/endTime "HH:MM" in the server's local timezone, slotMinutes 10..120.
exports.generateSlots = async (req, res, next) => {
  try {
    const provider = await db.healthProvider.findUnique({ where: { id: uuid(req.params.id) } });
    if (!provider) throw new HttpError(404, 'NOT_FOUND', 'Provider not found.');
    const { errors, values } = r.validate(req.body, {
      date: [r.required('Choose a date.'), r.dateWithin(0, 120, 'Choose a date within the next 120 days.')],
      startTime: [r.required('Enter a start time.'), r.pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')],
      endTime: [r.required('Enter an end time.'), r.pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.')],
      slotMinutes: [r.required('Enter the slot length.'), r.intRange(10, 120, 'Slot length must be 10 to 120 minutes.')]
    });
    if (!errors.startTime && !errors.endTime && values.endTime <= values.startTime) errors.endTime = 'The end time must be after the start time.';
    if (Object.keys(errors).length) fail(errors);
    const [y, m, d] = values.date.split('-').map(Number);
    const [sh, sm] = values.startTime.split(':').map(Number);
    const [eh, em] = values.endTime.split(':').map(Number);
    const step = Number(values.slotMinutes);
    const slots = [];
    for (let t = new Date(y, m - 1, d, sh, sm); ; t = new Date(t.getTime() + step * 60000)) {
      const end = new Date(t.getTime() + step * 60000);
      if (end > new Date(y, m - 1, d, eh, em) || slots.length >= 48) break;
      if (t > new Date()) slots.push({ providerId: provider.id, startsAt: t, endsAt: end });
    }
    if (!slots.length) throw new HttpError(400, 'VALIDATION_ERROR', 'That window produces no future slots.', { startTime: 'No future slots fit in this window.' });
    const { count } = await db.healthSlot.createMany({ data: slots, skipDuplicates: true });
    await audit(req.user, 'healthcare.slots.generate', 'HealthProvider', provider.id, `Added ${count} slots for ${provider.name} on ${values.date}`);
    ok(res, { created: count, skipped: slots.length - count }, { status: 201, message: `${count} slot${count === 1 ? '' : 's'} added.` });
  } catch (e) { next(e); }
};

exports.providerSlots = async (req, res, next) => {
  try {
    const rows = await db.healthSlot.findMany({ where: { providerId: uuid(req.params.id), startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' }, take: 300, include: { appointment: { select: { referenceNo: true, status: true } } } });
    ok(res, { slots: rows });
  } catch (e) { next(e); }
};

exports.setSlotStatus = async (req, res, next) => {
  try {
    const slot = await db.healthSlot.findUnique({ where: { id: uuid(req.params.id) } });
    if (!slot) throw new HttpError(404, 'NOT_FOUND', 'Slot not found.');
    const to = oneOf(req.body?.status, ['OPEN', 'BLOCKED'], 'status');
    if (!to) throw new HttpError(400, 'VALIDATION_ERROR', 'status must be OPEN or BLOCKED.');
    if (slot.status === 'BOOKED') throw new HttpError(409, 'INVALID_STATE', 'A booked slot cannot be changed. Cancel or reschedule the appointment first.');
    const updated = await db.healthSlot.update({ where: { id: slot.id }, data: { status: to } });
    ok(res, { slot: updated });
  } catch (e) { next(e); }
};

exports.deleteSlot = async (req, res, next) => {
  try {
    const slot = await db.healthSlot.findUnique({ where: { id: uuid(req.params.id) } });
    if (!slot) throw new HttpError(404, 'NOT_FOUND', 'Slot not found.');
    if (slot.status === 'BOOKED') throw new HttpError(409, 'INVALID_STATE', 'A booked slot cannot be deleted.');
    await db.healthSlot.delete({ where: { id: slot.id } });
    ok(res, null, { message: 'Slot deleted.' });
  } catch (e) { next(e); }
};
