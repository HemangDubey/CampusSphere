// Leave requests and approvals.
// Rules enforced here: students pick an assigned reviewer (faculty or administrator), cannot decide their own
// request, and only the assigned reviewer or an administrator can decide. Leave rules below are
// configurable demonstration values, not an official policy.
const db = require('../db');
const r = require('../validators/rules');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');
const { withRef } = require('../utils/ref');
const { notify } = require('../services/notify');
const { recordStatus, timeline } = require('../services/history');
const { audit } = require('../services/audit');
const { isAdmin } = require('../permissions');

const RULES = { maxDays: 30, maxAdvanceDays: 180, maxBackdateDays: 7 };
const CATEGORIES = ['MEDICAL', 'PERSONAL', 'FAMILY', 'ACADEMIC', 'OTHER'];
const ACTIVE = ['SUBMITTED', 'INFO_REQUIRED', 'APPROVED'];

const include = { student: { select: { id: true, name: true, email: true, department: true, registrationNo: true } }, reviewer: { select: { id: true, name: true } } };
const iso = (d) => d.toISOString().slice(0, 10);
const shape = (l) => ({ ...l, startDate: iso(l.startDate), endDate: iso(l.endDate), days: Math.round((l.endDate - l.startDate) / 86400000) + 1 });

exports.rules = (req, res) => ok(res, { rules: RULES, categories: CATEGORIES, demo: true });

exports.reviewers = async (req, res, next) => {
  try {
    const rows = await db.user.findMany({ where: { status: 'ACTIVE', role: { in: ['FACULTY', 'CAMPUS_ADMIN'] }, id: { not: req.user.id } }, select: { id: true, name: true, department: true, role: true }, orderBy: { name: 'asc' } });
    ok(res, { reviewers: rows });
  } catch (e) { next(e); }
};

const schema = {
  category: [r.required('Choose a category.'), r.oneOf(CATEGORIES)],
  startDate: [r.required('Choose the first day of leave.'), r.pattern(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')],
  endDate: [r.required('Choose the last day of leave.'), r.pattern(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date.')],
  reason: [r.required('Explain the reason for your leave.'), r.minLength(10, 'Please give a little more detail (at least 10 characters).'), r.maxLength(1000)]
};

exports.create = async (req, res, next) => {
  try {
    const { errors, values } = r.validate(req.body, schema);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const day = (s) => new Date(`${s}T00:00:00Z`);
    if (!errors.startDate && Number.isNaN(day(values.startDate).getTime())) errors.startDate = 'Enter a valid date.';
    if (!errors.endDate && Number.isNaN(day(values.endDate).getTime())) errors.endDate = 'Enter a valid date.';
    if (!errors.startDate && !errors.endDate) {
      const s = day(values.startDate); const e = day(values.endDate);
      if (e < s) errors.endDate = 'The last day cannot be before the first day.';
      else if ((e - s) / 86400000 + 1 > RULES.maxDays) errors.endDate = `Leave can be at most ${RULES.maxDays} days per request.`;
      if ((s - today) / 86400000 < -RULES.maxBackdateDays) errors.startDate = `Leave cannot start more than ${RULES.maxBackdateDays} days in the past.`;
      else if ((s - today) / 86400000 > RULES.maxAdvanceDays) errors.startDate = `Leave cannot be requested more than ${RULES.maxAdvanceDays} days ahead.`;
    }
    if (!req.body?.reviewerId) errors.reviewerId = 'Choose who should review your request.';
    if (req.body?.confirm !== true) errors.confirm = 'Please review and confirm your request.';
    if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);

    const reviewer = await db.user.findFirst({ where: { id: uuid(req.body.reviewerId), status: 'ACTIVE', role: { in: ['FACULTY', 'CAMPUS_ADMIN'] } } });
    if (!reviewer || reviewer.id === req.user.id) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose a faculty member or administrator as reviewer.', { reviewerId: 'Choose a faculty member or administrator as reviewer.' });
    const s = day(values.startDate); const e = day(values.endDate);
    const overlap = await db.leaveRequest.findFirst({ where: { studentId: req.user.id, status: { in: ACTIVE }, startDate: { lte: e }, endDate: { gte: s } } });
    if (overlap) throw new HttpError(409, 'OVERLAP', `This overlaps your leave request ${overlap.referenceNo} (${iso(overlap.startDate)} to ${iso(overlap.endDate)}).`, { startDate: 'Overlaps an existing request.' });

    const leave = await withRef('LV', (referenceNo) => db.leaveRequest.create({
      data: { referenceNo, studentId: req.user.id, reviewerId: reviewer.id, category: values.category, startDate: s, endDate: e, reason: values.reason }, include
    }));
    await recordStatus('LEAVE', leave.id, req.user, null, 'SUBMITTED', 'Leave requested');
    await notify(reviewer.id, { type: 'LEAVE', title: `Leave request from ${req.user.name}`, body: `${values.startDate} to ${values.endDate} (${leave.referenceNo})`, link: '/approvals' });
    await notify(req.user.id, { type: 'LEAVE', title: 'Leave request submitted', body: `Reference ${leave.referenceNo}`, link: `/leave/${leave.id}` });
    ok(res, { leave: shape(leave) }, { status: 201, message: 'Leave request submitted.' });
  } catch (e) { next(e); }
};

async function loadVisible(req) {
  const leave = await db.leaveRequest.findUnique({ where: { id: uuid(req.params.id) }, include });
  const allowed = leave && (leave.studentId === req.user.id || leave.reviewerId === req.user.id || isAdmin(req.user));
  if (!allowed) throw new HttpError(404, 'NOT_FOUND', 'Leave request not found.');
  return leave;
}

exports.mine = async (req, res, next) => {
  try {
    const status = oneOf(req.query.status, ['SUBMITTED', 'INFO_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN'], 'status');
    const rows = await db.leaveRequest.findMany({ where: { studentId: req.user.id, ...(status && { status }) }, include, orderBy: { createdAt: 'desc' } });
    ok(res, { leaves: rows.map(shape) });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const leave = await loadVisible(req);
    ok(res, { leave: shape(leave), history: await timeline('LEAVE', leave.id), isStudent: leave.studentId === req.user.id });
  } catch (e) { next(e); }
};

exports.withdraw = async (req, res, next) => {
  try {
    const leave = await loadVisible(req);
    if (leave.studentId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'Only the student can withdraw a leave request.');
    if (!['SUBMITTED', 'INFO_REQUIRED'].includes(leave.status)) throw new HttpError(409, 'INVALID_STATE', 'A decided request cannot be withdrawn.');
    const updated = await db.leaveRequest.update({ where: { id: leave.id }, data: { status: 'WITHDRAWN' }, include });
    await recordStatus('LEAVE', leave.id, req.user, leave.status, 'WITHDRAWN', 'Withdrawn by student');
    await notify(leave.reviewerId, { type: 'LEAVE', title: `Leave withdrawn: ${leave.student.name}`, body: leave.referenceNo, link: '/approvals' });
    ok(res, { leave: shape(updated) }, { message: 'Leave request withdrawn.' });
  } catch (e) { next(e); }
};

exports.respond = async (req, res, next) => {
  try {
    const leave = await loadVisible(req);
    if (leave.studentId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'Only the student can respond.');
    if (leave.status !== 'INFO_REQUIRED') throw new HttpError(409, 'INVALID_STATE', 'This request is not waiting for more information.');
    const message = text(req.body?.message, 1000);
    if (message.length < 3) throw new HttpError(400, 'VALIDATION_ERROR', 'Please enter the requested information.', { message: 'Please enter the requested information.' });
    const updated = await db.leaveRequest.update({ where: { id: leave.id }, data: { status: 'SUBMITTED' }, include });
    await recordStatus('LEAVE', leave.id, req.user, 'INFO_REQUIRED', 'SUBMITTED', message);
    await notify(leave.reviewerId, { type: 'LEAVE', title: `Information added: ${leave.referenceNo}`, body: message.slice(0, 120), link: '/approvals' });
    ok(res, { leave: shape(updated) }, { message: 'Information sent.' });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------- reviewer side
exports.queue = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 20 });
    const status = oneOf(req.query.status, ['SUBMITTED', 'INFO_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN'], 'status');
    const q = text(req.query.student, 60);
    const from = req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? new Date(`${req.query.from}T00:00:00Z`) : undefined;
    const to = req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? new Date(`${req.query.to}T00:00:00Z`) : undefined;
    const where = {
      ...(isAdmin(req.user) ? {} : { reviewerId: req.user.id }), ...(status && { status }),
      ...(q && { student: { name: { contains: q, mode: 'insensitive' } } }), ...(from && { endDate: { gte: from } }), ...(to && { startDate: { lte: to } })
    };
    const [total, rows] = await Promise.all([db.leaveRequest.count({ where }), db.leaveRequest.findMany({ where, include, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }], skip, take })]);
    ok(res, { leaves: rows.map(shape), page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

const DECISIONS = { APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_INFO: 'INFO_REQUIRED' };

exports.decide = async (req, res, next) => {
  try {
    const leave = await loadVisible(req);
    if (leave.studentId === req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You cannot decide your own leave request.');
    if (!isAdmin(req.user) && leave.reviewerId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'This request is assigned to another reviewer.');
    const to = DECISIONS[req.body?.decision];
    if (!to) throw new HttpError(400, 'VALIDATION_ERROR', 'decision must be APPROVE, REJECT or REQUEST_INFO.');
    if (leave.status !== 'SUBMITTED') throw new HttpError(409, 'INVALID_STATE', leave.status === 'INFO_REQUIRED' ? 'Waiting for the student to respond.' : 'This request has already been decided or withdrawn.');
    const note = text(req.body?.note, 1000);
    if (to !== 'APPROVED' && note.length < 5) throw new HttpError(400, 'VALIDATION_ERROR', 'Please add a note (at least 5 characters).', { note: 'Please add a note (at least 5 characters).' });
    const updated = await db.leaveRequest.update({ where: { id: leave.id }, data: { status: to, decisionNote: note || null, decidedAt: to === 'INFO_REQUIRED' ? null : new Date() }, include });
    await recordStatus('LEAVE', leave.id, req.user, leave.status, to, note);
    await notify(leave.studentId, { type: 'LEAVE', title: to === 'APPROVED' ? 'Leave approved' : to === 'REJECTED' ? 'Leave rejected' : 'More information needed for your leave', body: note || leave.referenceNo, link: `/leave/${leave.id}` });
    await audit(req.user, `leave.${to.toLowerCase()}`, 'LeaveRequest', leave.id, `${to} leave ${leave.referenceNo} for ${leave.student.name}`, { note });
    ok(res, { leave: shape(updated) }, { message: 'Decision recorded.' });
  } catch (e) { next(e); }
};
