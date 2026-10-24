// Per-user feeds: notifications, activity history and the personalised dashboard summary.
const db = require('../db');
const { ok, HttpError } = require('../utils/response');
const { pageParams, uuid } = require('../utils/query');
const { permissionsFor, isAdmin } = require('../permissions');
const { shape: shapeEvent, withCount } = require('./events');

exports.notifications = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 20 });
    const unreadOnly = req.query.unread === 'true';
    const where = { userId: req.user.id, ...(unreadOnly && { readAt: null }) };
    const [total, rows, unread] = await Promise.all([
      db.notification.count({ where }), db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      db.notification.count({ where: { userId: req.user.id, readAt: null } })
    ]);
    ok(res, { notifications: rows, unread, page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.unreadCount = async (req, res, next) => {
  try { ok(res, { unread: await db.notification.count({ where: { userId: req.user.id, readAt: null } }) }); } catch (e) { next(e); }
};

exports.markRead = async (req, res, next) => {
  try {
    const { count } = await db.notification.updateMany({ where: { id: uuid(req.params.id), userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    const exists = count || (await db.notification.count({ where: { id: req.params.id, userId: req.user.id } }));
    if (!exists) throw new HttpError(404, 'NOT_FOUND', 'Notification not found.');
    ok(res, { unread: await db.notification.count({ where: { userId: req.user.id, readAt: null } }) });
  } catch (e) { next(e); }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const { count } = await db.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    ok(res, { updated: count, unread: 0 });
  } catch (e) { next(e); }
};

// A merged, newest-first history of what the signed-in user did and what happened to their items.
exports.activity = async (req, res, next) => {
  try {
    const uid = req.user.id;
    const [regs, reqs, leaves, appts] = await Promise.all([
      db.eventRegistration.findMany({ where: { userId: uid }, include: { event: { select: { title: true, id: true } } }, orderBy: { createdAt: 'desc' }, take: 30 }),
      db.serviceRequest.findMany({ where: { requesterId: uid }, select: { id: true, referenceNo: true, resource: { select: { title: true } } }, take: 50 }),
      db.leaveRequest.findMany({ where: { studentId: uid }, select: { id: true, referenceNo: true }, take: 50 }),
      db.appointment.findMany({ where: { userId: uid }, select: { id: true, referenceNo: true, service: { select: { name: true } } }, take: 50 })
    ]);
    const labels = new Map([...reqs.map((x) => [x.id, { type: 'SERVICE_REQUEST', text: `Request ${x.referenceNo}: ${x.resource.title}`, link: `/requests/${x.id}` }]), ...leaves.map((x) => [x.id, { type: 'LEAVE', text: `Leave ${x.referenceNo}`, link: `/leave/${x.id}` }]), ...appts.map((x) => [x.id, { type: 'APPOINTMENT', text: `Appointment ${x.referenceNo}: ${x.service.name}`, link: '/appointments' }])]);
    const history = await db.statusHistory.findMany({ where: { subjectId: { in: [...labels.keys()] } }, orderBy: { createdAt: 'desc' }, take: 60 });
    const items = [
      ...regs.map((x) => ({ at: x.createdAt, kind: 'EVENT', text: `Registered for ${x.event.title} (${x.referenceNo})`, link: `/events/${x.event.id}` })),
      ...regs.filter((x) => x.cancelledAt).map((x) => ({ at: x.cancelledAt, kind: 'EVENT', text: `Cancelled registration for ${x.event.title}`, link: `/events/${x.event.id}` })),
      ...history.map((h) => { const l = labels.get(h.subjectId); return { at: h.createdAt, kind: l.type, text: `${l.text} → ${h.toStatus.replace('_', ' ').toLowerCase()}${h.note ? ` (${h.note.slice(0, 80)})` : ''}`, link: l.link }; })
    ].sort((a, b) => b.at - a.at).slice(0, 50);
    ok(res, { activity: items });
  } catch (e) { next(e); }
};

const PROFILE_FIELDS = ['name', 'department', 'yearOfStudy', 'phone', 'registrationNo', 'bio'];

exports.dashboard = async (req, res, next) => {
  try {
    const u = req.user;
    const now = new Date();
    const [regs, requests, leaves, appts, favCount, bookmarkCount, notifications, announcements, unread, recent] = await Promise.all([
      db.eventRegistration.findMany({ where: { userId: u.id, status: 'REGISTERED', event: { startsAt: { gt: now }, status: 'PUBLISHED' } }, include: { event: { include: withCount } }, orderBy: { event: { startsAt: 'asc' } }, take: 4 }),
      db.serviceRequest.findMany({ where: { requesterId: u.id, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED'] } }, include: { resource: { select: { title: true } } }, orderBy: { createdAt: 'desc' }, take: 4 }),
      db.leaveRequest.findMany({ where: { studentId: u.id }, orderBy: { createdAt: 'desc' }, take: 3 }),
      db.appointment.findMany({ where: { userId: u.id, status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED'] } }, include: { service: { select: { name: true } }, slot: { select: { startsAt: true } } }, orderBy: { createdAt: 'desc' }, take: 3 }),
      db.favoriteDestination.count({ where: { userId: u.id } }),
      db.resourceBookmark.count({ where: { userId: u.id } }),
      db.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      db.announcement.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 3 }),
      db.notification.count({ where: { userId: u.id, readAt: null } }),
      db.recentDestinationView.findMany({ where: { userId: u.id }, include: { destination: { select: { slug: true, name: true, region: true } } }, orderBy: { viewedAt: 'desc' }, take: 3 })
    ]);
    const filled = PROFILE_FIELDS.filter((f) => u[f] !== null && u[f] !== undefined && u[f] !== '').length;
    const perms = permissionsFor(u.role);
    let work = null;
    if (perms.includes('leave:review') || perms.includes('request:review')) {
      const mine = isAdmin(u) ? {} : { assigneeId: u.id };
      work = {
        leavesToReview: await db.leaveRequest.count({ where: { status: 'SUBMITTED', ...(isAdmin(u) ? {} : { reviewerId: u.id }) } }),
        requestsToReview: await db.serviceRequest.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, ...mine } }),
        overdueRequests: await db.serviceRequest.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED'] }, dueAt: { lt: now }, ...mine } })
      };
    }
    ok(res, {
      counts: { registrations: regs.length, openRequests: requests.length, favorites: favCount, bookmarks: bookmarkCount, unreadNotifications: unread },
      upcomingEvents: regs.map((x) => ({ ...shapeEvent(x.event, { mine: x }), referenceNo: x.referenceNo })),
      openRequests: requests, leaves, appointments: appts, notifications, announcements, recentDestinations: recent.map((x) => x.destination), work,
      profile: { completeness: Math.round((filled / PROFILE_FIELDS.length) * 100), missing: PROFILE_FIELDS.filter((f) => u[f] === null || u[f] === undefined || u[f] === '') }
    });
  } catch (e) { next(e); }
};

exports.announcements = async (req, res, next) => {
  try { ok(res, { announcements: await db.announcement.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 20 }) }); } catch (e) { next(e); }
};
