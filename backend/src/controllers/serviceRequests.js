// Service requests against campus resources. One status workflow, enforced on the server:
//   SUBMITTED -> UNDER_REVIEW -> INFO_REQUIRED <-> UNDER_REVIEW -> APPROVED | REJECTED, and CANCELLED by the requester.
const db = require('../db');
const { ok, HttpError } = require('../utils/response');
const { pageParams, oneOf, text, uuid } = require('../utils/query');
const { withRef } = require('../utils/ref');
const { notify, notifyMany } = require('../services/notify');
const { recordStatus, timeline } = require('../services/history');
const { audit } = require('../services/audit');
const { isAdmin, can } = require('../permissions');

const SLA_DAYS = 5; // demonstration target for "overdue"; configurable in code, not official policy
const OPEN = ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED'];
const STAFF_TRANSITIONS = {
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['INFO_REQUIRED', 'APPROVED', 'REJECTED'],
  INFO_REQUIRED: ['REJECTED']
};
const NOTE_REQUIRED = ['INFO_REQUIRED', 'REJECTED'];

const include = { resource: { select: { id: true, title: true, kind: true } }, requester: { select: { id: true, name: true, email: true, department: true } }, assignee: { select: { id: true, name: true } } };
const shape = (r) => ({ ...r, overdue: Boolean(r.dueAt && r.dueAt < new Date() && OPEN.includes(r.status)) });

// Validates answers against the resource's configured form fields: [{ name, label, type, required, options, maxLength }].
function validateAnswers(fields, data) {
  const errors = {};
  const out = {};
  const input = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  for (const f of Array.isArray(fields) ? fields : []) {
    const raw = typeof input[f.name] === 'string' ? input[f.name].trim() : input[f.name];
    const empty = raw === undefined || raw === null || raw === '';
    if (empty) { if (f.required) errors[f.name] = `${f.label || f.name} is required.`; continue; }
    const s = String(raw);
    if (s.length > (f.maxLength || 1000)) errors[f.name] = `${f.label || f.name} is too long.`;
    else if (f.type === 'select' && !(f.options || []).includes(s)) errors[f.name] = `Choose a valid ${f.label || f.name}.`;
    else if (f.type === 'number' && !Number.isFinite(Number(s))) errors[f.name] = `${f.label || f.name} must be a number.`;
    else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) errors[f.name] = `${f.label || f.name} must be a date.`;
    else out[f.name] = f.type === 'number' ? Number(s) : s;
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
  return out;
}

async function adminIds() {
  return (await db.user.findMany({ where: { role: { in: ['CAMPUS_ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' }, select: { id: true } })).map((u) => u.id);
}

exports.create = async (req, res, next) => {
  try {
    const resource = await db.resource.findUnique({ where: { id: uuid(req.body?.resourceId) } });
    if (!resource || !resource.published) throw new HttpError(404, 'NOT_FOUND', 'Resource not found.');
    if (!resource.acceptsRequests) throw new HttpError(400, 'NOT_REQUESTABLE', 'This resource does not accept requests.');
    if (resource.status === 'UNAVAILABLE') throw new HttpError(409, 'UNAVAILABLE', 'This resource is currently unavailable.');
    if (req.body?.confirm !== true) throw new HttpError(400, 'VALIDATION_ERROR', 'Please review and confirm your request.', { confirm: 'Please review and confirm your request.' });
    const data = validateAnswers(resource.formFields, req.body?.data);
    const open = await db.serviceRequest.count({ where: { requesterId: req.user.id, resourceId: resource.id, status: { in: OPEN } } });
    if (open >= 3) throw new HttpError(409, 'LIMIT_REACHED', 'You already have 3 open requests for this resource.');
    const request = await withRef('SR', (referenceNo) => db.serviceRequest.create({
      data: { referenceNo, requesterId: req.user.id, resourceId: resource.id, data, dueAt: new Date(Date.now() + SLA_DAYS * 86400000) }, include
    }));
    await recordStatus('SERVICE_REQUEST', request.id, req.user, null, 'SUBMITTED', 'Request submitted');
    await notify(req.user.id, { type: 'REQUEST', title: `Request submitted: ${resource.title}`, body: `Reference ${request.referenceNo}`, link: `/requests/${request.id}` });
    await notifyMany(await adminIds(), { type: 'REQUEST', title: `New request: ${resource.title}`, body: `${req.user.name} (${request.referenceNo})`, link: `/admin/requests` });
    ok(res, { request: shape(request) }, { status: 201, message: 'Request submitted.' });
  } catch (e) { next(e); }
};

exports.mine = async (req, res, next) => {
  try {
    const status = oneOf(req.query.status, ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED', 'APPROVED', 'REJECTED', 'CANCELLED'], 'status');
    const rows = await db.serviceRequest.findMany({ where: { requesterId: req.user.id, ...(status && { status }) }, include, orderBy: { createdAt: 'desc' } });
    ok(res, { requests: rows.map(shape) });
  } catch (e) { next(e); }
};

// A request is visible to its requester, its assignee, and administrators.
async function loadVisible(req) {
  const request = await db.serviceRequest.findUnique({ where: { id: uuid(req.params.id) }, include });
  const ok_ = request && (request.requesterId === req.user.id || request.assigneeId === req.user.id || isAdmin(req.user));
  if (!ok_) throw new HttpError(404, 'NOT_FOUND', 'Request not found.');
  return request;
}

exports.get = async (req, res, next) => {
  try {
    const request = await loadVisible(req);
    const resource = await db.resource.findUnique({ where: { id: request.resourceId }, select: { formFields: true } });
    ok(res, { request: shape(request), formFields: resource?.formFields || [], history: await timeline('SERVICE_REQUEST', request.id), isRequester: request.requesterId === req.user.id });
  } catch (e) { next(e); }
};

exports.respond = async (req, res, next) => {
  try {
    const request = await loadVisible(req);
    if (request.requesterId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'Only the requester can add information.');
    if (request.status !== 'INFO_REQUIRED') throw new HttpError(409, 'INVALID_STATE', 'This request is not waiting for more information.');
    const message = text(req.body?.message, 1000);
    if (message.length < 3) throw new HttpError(400, 'VALIDATION_ERROR', 'Please enter the requested information.', { message: 'Please enter the requested information.' });
    const updated = await db.serviceRequest.update({ where: { id: request.id }, data: { status: 'UNDER_REVIEW' }, include });
    await recordStatus('SERVICE_REQUEST', request.id, req.user, 'INFO_REQUIRED', 'UNDER_REVIEW', message);
    await notifyMany([request.assigneeId, ...(request.assigneeId ? [] : await adminIds())], { type: 'REQUEST', title: `Information added: ${request.referenceNo}`, body: message.slice(0, 120), link: '/admin/requests' });
    ok(res, { request: shape(updated) }, { message: 'Information sent.' });
  } catch (e) { next(e); }
};

exports.cancel = async (req, res, next) => {
  try {
    const request = await loadVisible(req);
    if (request.requesterId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'Only the requester can cancel a request.');
    if (!OPEN.includes(request.status)) throw new HttpError(409, 'INVALID_STATE', 'This request can no longer be cancelled.');
    const updated = await db.serviceRequest.update({ where: { id: request.id }, data: { status: 'CANCELLED' }, include });
    await recordStatus('SERVICE_REQUEST', request.id, req.user, request.status, 'CANCELLED', text(req.body?.reason, 300) || 'Cancelled by requester');
    ok(res, { request: shape(updated) }, { message: 'Request cancelled.' });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------- staff side
exports.queue = async (req, res, next) => {
  try {
    const { skip, take, page, size } = pageParams(req.query, { defaultSize: 20 });
    const status = oneOf(req.query.status, ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED', 'APPROVED', 'REJECTED', 'CANCELLED'], 'status');
    const assigned = oneOf(req.query.assigned, ['me', 'unassigned'], 'assigned');
    const q = text(req.query.q, 60);
    const overdue = req.query.overdue === 'true';
    const where = {
      ...(isAdmin(req.user) ? {} : { assigneeId: req.user.id }),
      ...(status && { status }), ...(assigned === 'me' && { assigneeId: req.user.id }), ...(assigned === 'unassigned' && { assigneeId: null }),
      ...(overdue && { status: { in: OPEN }, dueAt: { lt: new Date() } }),
      ...(q && { OR: [{ referenceNo: { contains: q, mode: 'insensitive' } }, { requester: { name: { contains: q, mode: 'insensitive' } } }, { resource: { title: { contains: q, mode: 'insensitive' } } }] })
    };
    const [total, rows, overdueCount] = await Promise.all([
      db.serviceRequest.count({ where }), db.serviceRequest.findMany({ where, include, orderBy: [{ dueAt: 'asc' }], skip, take }),
      db.serviceRequest.count({ where: { ...(isAdmin(req.user) ? {} : { assigneeId: req.user.id }), status: { in: OPEN }, dueAt: { lt: new Date() } } })
    ]);
    ok(res, { requests: rows.map(shape), overdueCount, page, pageSize: size, total, totalPages: Math.max(Math.ceil(total / size), 1) });
  } catch (e) { next(e); }
};

exports.handlers = async (req, res, next) => {
  try {
    const rows = await db.user.findMany({ where: { status: 'ACTIVE', role: { in: ['FACULTY', 'CAMPUS_ADMIN', 'SUPER_ADMIN'] } }, select: { id: true, name: true, role: true, department: true }, orderBy: { name: 'asc' } });
    ok(res, { handlers: rows });
  } catch (e) { next(e); }
};

exports.assign = async (req, res, next) => {
  try {
    if (!isAdmin(req.user)) throw new HttpError(403, 'FORBIDDEN', 'Only administrators can assign handlers.');
    const request = await loadVisible(req);
    if (!OPEN.includes(request.status)) throw new HttpError(409, 'INVALID_STATE', 'Closed requests cannot be reassigned.');
    const assignee = await db.user.findFirst({ where: { id: uuid(req.body?.assigneeId), status: 'ACTIVE', role: { in: ['FACULTY', 'CAMPUS_ADMIN', 'SUPER_ADMIN'] } } });
    if (!assignee) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose an active faculty member or administrator.', { assigneeId: 'Choose an active faculty member or administrator.' });
    if (assignee.id === request.requesterId) throw new HttpError(400, 'VALIDATION_ERROR', 'A request cannot be assigned to its own requester.', { assigneeId: 'A request cannot be assigned to its own requester.' });
    const updated = await db.serviceRequest.update({ where: { id: request.id }, data: { assigneeId: assignee.id }, include });
    await recordStatus('SERVICE_REQUEST', request.id, req.user, request.status, request.status, `Assigned to ${assignee.name}`);
    await notify(assignee.id, { type: 'REQUEST', title: `Request assigned to you: ${request.referenceNo}`, body: request.resource.title, link: '/admin/requests' });
    await audit(req.user, 'request.assign', 'ServiceRequest', request.id, `Assigned ${request.referenceNo} to ${assignee.name}`);
    ok(res, { request: shape(updated) }, { message: `Assigned to ${assignee.name}.` });
  } catch (e) { next(e); }
};

exports.transition = async (req, res, next) => {
  try {
    const request = await loadVisible(req);
    if (request.requesterId === req.user.id) throw new HttpError(403, 'FORBIDDEN', 'You cannot review your own request.');
    if (!isAdmin(req.user) && request.assigneeId !== req.user.id) throw new HttpError(403, 'FORBIDDEN', 'This request is not assigned to you.');
    const to = req.body?.to;
    const allowed = STAFF_TRANSITIONS[request.status] || [];
    if (!allowed.includes(to)) throw new HttpError(409, 'INVALID_TRANSITION', `A ${request.status.toLowerCase().replace('_', ' ')} request cannot move to ${String(to).toLowerCase().replace('_', ' ')}.`);
    const note = text(req.body?.note, 1000);
    if (NOTE_REQUIRED.includes(to) && note.length < 5) throw new HttpError(400, 'VALIDATION_ERROR', 'Please add a reason (at least 5 characters).', { note: 'Please add a reason (at least 5 characters).' });
    const data = { status: to, ...(['APPROVED', 'REJECTED'].includes(to) && { decisionNote: note || null }), ...(!request.assigneeId && { assigneeId: req.user.id }) };
    const updated = await db.serviceRequest.update({ where: { id: request.id }, data, include });
    await recordStatus('SERVICE_REQUEST', request.id, req.user, request.status, to, note);
    await notify(request.requesterId, { type: 'REQUEST', title: `Request ${to.toLowerCase().replace('_', ' ')}: ${request.referenceNo}`, body: note || request.resource.title, link: `/requests/${request.id}` });
    if (['APPROVED', 'REJECTED'].includes(to)) await audit(req.user, `request.${to.toLowerCase()}`, 'ServiceRequest', request.id, `${to === 'APPROVED' ? 'Approved' : 'Rejected'} ${request.referenceNo}`, { note });
    ok(res, { request: shape(updated) }, { message: 'Status updated.' });
  } catch (e) { next(e); }
};

module.exports.can = can;
