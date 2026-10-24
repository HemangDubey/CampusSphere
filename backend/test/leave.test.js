// Leave requests and approvals: validation, overlap, reviewer permissions, self-approval, decisions, history.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client, signUp } = require('./helpers');

const PREFIX = `test-${Date.now()}`;
const iso = (days) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

(async () => {
  const server = await start(createServer);
  const anon = client(server);
  let failed = false;
  try {
    const s1 = await signUp(server, db, PREFIX, 's1');
    const s2 = await signUp(server, db, PREFIX, 's2');
    const fac = await signUp(server, db, PREFIX, 'fac', 'FACULTY');
    const fac2 = await signUp(server, db, PREFIX, 'fac2', 'FACULTY');
    const admin = await signUp(server, db, PREFIX, 'admin', 'CAMPUS_ADMIN');
    const org = await signUp(server, db, PREFIX, 'org', 'EVENT_ORGANIZER');
    const body = (o = {}) => ({ reviewerId: fac.id, category: 'MEDICAL', startDate: iso(3), endDate: iso(5), reason: 'Recovering from a minor surgery.', confirm: true, ...o });

    // ---- Rules and reviewers
    assert.equal((await anon.get('/api/leave/rules')).body.data.rules.maxDays, 30);
    assert.equal((await anon.get('/api/leave/reviewers')).status, 401);
    const rev = (await s1.api.get('/api/leave/reviewers')).body.data.reviewers;
    assert.ok(rev.some((x) => x.id === fac.id) && rev.some((x) => x.id === admin.id));
    assert.equal(rev.some((x) => x.id === s2.id || x.id === org.id), false, 'only faculty and campus admins can review');

    // ---- Validation
    assert.equal((await anon.post('/api/leave', body())).status, 401);
    let r = await s1.api.post('/api/leave', { confirm: false });
    assert.equal(r.status, 400);
    ['category', 'startDate', 'endDate', 'reason', 'reviewerId', 'confirm'].forEach((f) => assert.ok(r.body.error.details[f], `error for ${f}`));
    assert.ok((await s1.api.post('/api/leave', body({ startDate: iso(6), endDate: iso(4) }))).body.error.details.endDate, 'end before start');
    assert.ok((await s1.api.post('/api/leave', body({ startDate: iso(2), endDate: iso(40) }))).body.error.details.endDate, 'longer than 30 days');
    assert.ok((await s1.api.post('/api/leave', body({ startDate: iso(-30), endDate: iso(-29) }))).body.error.details.startDate, 'too far in the past');
    assert.ok((await s1.api.post('/api/leave', body({ startDate: iso(400), endDate: iso(401) }))).body.error.details.startDate, 'too far ahead');
    assert.ok((await s1.api.post('/api/leave', body({ startDate: '2026-02-30', endDate: '2026-03-01' }))).body.error.details.startDate, 'impossible date');
    assert.equal((await s1.api.post('/api/leave', body({ reason: 'short' }))).status, 400);
    assert.equal((await s1.api.post('/api/leave', body({ category: 'HOLIDAY' }))).status, 400);
    assert.equal((await s1.api.post('/api/leave', body({ reviewerId: s2.id }))).status, 400, 'a student cannot be the reviewer');
    assert.equal((await s1.api.post('/api/leave', body({ reviewerId: org.id }))).status, 400, 'organizers do not review leave');
    assert.equal((await fac.api.post('/api/leave', body({ reviewerId: fac.id }))).status, 400, 'cannot review yourself');

    // ---- Submit + overlap
    r = await s1.api.post('/api/leave', body());
    assert.equal(r.status, 201);
    const leave = r.body.data.leave;
    assert.match(leave.referenceNo, /^LV-\d{4}-[A-Z0-9]{6}$/);
    assert.equal(leave.status, 'SUBMITTED');
    assert.equal(leave.days, 3);
    assert.ok(await db.notification.findFirst({ where: { userId: fac.id, title: { contains: 'Leave request from' } } }), 'reviewer is notified');
    r = await s1.api.post('/api/leave', body({ startDate: iso(5), endDate: iso(8) }));
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'OVERLAP');
    assert.equal((await s1.api.post('/api/leave', body({ startDate: iso(6), endDate: iso(7) }))).status, 201, 'adjacent range is fine');
    assert.equal((await s2.api.post('/api/leave', body())).status, 201, 'overlap is per student');

    // ---- Visibility
    assert.equal((await s1.api.get('/api/leave/mine')).body.data.leaves.length, 2);
    assert.equal((await s2.api.get(`/api/leave/${leave.id}`)).status, 404, "students cannot read each other's leave");
    assert.equal((await fac2.api.get(`/api/leave/${leave.id}`)).status, 404, 'other faculty cannot read it');
    assert.equal((await fac.api.get(`/api/leave/${leave.id}`)).status, 200);
    assert.equal((await admin.api.get(`/api/leave/${leave.id}`)).status, 200);
    assert.equal((await s2.api.post(`/api/leave/${leave.id}/withdraw`)).status, 404);
    assert.equal((await s1.api.get('/api/manage/leave')).status, 403);
    assert.equal((await org.api.get('/api/manage/leave')).status, 403);
    assert.equal((await anon.get('/api/manage/leave')).status, 401);
    r = await fac.api.get('/api/manage/leave?status=SUBMITTED');
    assert.equal(r.body.data.leaves.length, 3, 's1 two requests and s2 one');
    assert.equal((await fac2.api.get('/api/manage/leave')).body.data.leaves.length, 0, 'faculty only see their own queue');
    assert.ok((await admin.api.get('/api/manage/leave?student=tester%20s1')).body.data.leaves.length >= 2, 'admins see all and can filter by student');
    assert.equal((await fac.api.get(`/api/manage/leave?from=${iso(20)}`)).body.data.leaves.length, 0);

    // ---- Decisions and permissions
    const dec = (api, id, d, note) => api.post(`/api/manage/leave/${id}/decision`, { decision: d, note });
    assert.equal((await dec(s1.api, leave.id, 'APPROVE')).status, 403, 'students cannot approve');
    assert.equal((await dec(anon, leave.id, 'APPROVE')).status, 401);
    assert.equal((await dec(fac2.api, leave.id, 'APPROVE')).status, 404, 'unassigned faculty cannot decide');
    assert.equal((await dec(fac.api, leave.id, 'MAYBE')).status, 400);
    assert.equal((await dec(fac.api, leave.id, 'REJECT', 'no')).status, 400, 'rejection needs a note');
    assert.equal((await dec(fac.api, leave.id, 'REQUEST_INFO', '')).status, 400);

    // self-approval is blocked even when the student is a faculty member or an administrator
    const own = (await fac.api.post('/api/leave', body({ reviewerId: admin.id, startDate: iso(10), endDate: iso(11) }))).body.data.leave;
    assert.equal((await dec(fac.api, own.id, 'APPROVE')).status, 403, 'faculty cannot approve their own leave');
    const adminOwn = (await admin.api.post('/api/leave', body({ reviewerId: fac.id, startDate: iso(12), endDate: iso(13) }))).body.data.leave;
    assert.equal((await dec(admin.api, adminOwn.id, 'APPROVE')).status, 403, 'admins cannot approve their own leave');
    assert.equal((await dec(fac.api, adminOwn.id, 'APPROVE')).status, 200, 'but the assigned reviewer can');
    assert.equal((await dec(admin.api, own.id, 'APPROVE')).status, 200, 'the assigned admin can approve the faculty member');

    // request more information
    r = await dec(fac.api, leave.id, 'REQUEST_INFO', 'Please attach the doctor note reference.');
    assert.equal(r.body.data.leave.status, 'INFO_REQUIRED');
    assert.equal((await dec(fac.api, leave.id, 'APPROVE')).status, 409, 'waiting for the student');
    assert.equal((await s2.api.post(`/api/leave/${leave.id}/respond`, { message: 'hello there' })).status, 404);
    assert.equal((await fac.api.post(`/api/leave/${leave.id}/respond`, { message: 'hello there' })).status, 403);
    assert.equal((await s1.api.post(`/api/leave/${leave.id}/respond`, { message: '' })).status, 400);
    assert.equal((await s1.api.post(`/api/leave/${leave.id}/respond`, { message: 'Note reference MC-123.' })).body.data.leave.status, 'SUBMITTED');

    // approve, then everything is final
    r = await dec(fac.api, leave.id, 'APPROVE', 'Get well soon.');
    assert.equal(r.body.data.leave.status, 'APPROVED');
    assert.ok(r.body.data.leave.decidedAt);
    assert.equal((await dec(fac.api, leave.id, 'REJECT', 'changed my mind')).status, 409);
    assert.equal((await s1.api.post(`/api/leave/${leave.id}/withdraw`)).status, 409, 'a decided request cannot be withdrawn');
    assert.ok(await db.notification.findFirst({ where: { userId: s1.id, title: 'Leave approved' } }));
    r = await s1.api.get(`/api/leave/${leave.id}`);
    assert.deepEqual(r.body.data.history.map((h) => h.toStatus), ['SUBMITTED', 'INFO_REQUIRED', 'SUBMITTED', 'APPROVED']);
    assert.equal(r.body.data.leave.decisionNote, 'Get well soon.');
    const audits = await db.auditLog.findMany({ where: { entityId: leave.id } });
    assert.ok(audits.some((l) => l.action === 'leave.approved') && audits.some((l) => l.action === 'leave.info_required'));

    // withdraw a pending request, and the freed range can be reused
    const pending = (await s1.api.get('/api/leave/mine?status=SUBMITTED')).body.data.leaves[0];
    assert.equal((await s1.api.post(`/api/leave/${pending.id}/withdraw`)).body.data.leave.status, 'WITHDRAWN');
    assert.equal((await s1.api.post('/api/leave', body({ startDate: pending.startDate, endDate: pending.endDate }))).status, 201);
    assert.equal((await dec(fac.api, pending.id, 'APPROVE')).status, 409, 'withdrawn requests cannot be approved');

    // rejection path
    const rej = (await s2.api.get('/api/leave/mine')).body.data.leaves[0];
    r = await dec(fac.api, rej.id, 'REJECT', 'Exam week, please reschedule.');
    assert.equal(r.body.data.leave.status, 'REJECTED');
    assert.ok(await db.notification.findFirst({ where: { userId: s2.id, title: 'Leave rejected' } }));
    console.log('Leave tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    // Reviewers cannot be deleted while leave requests reference them (onDelete: Restrict), so remove those first.
    await db.leaveRequest.deleteMany({ where: { OR: [{ student: { email: { startsWith: PREFIX } } }, { reviewer: { email: { startsWith: PREFIX } } }] } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
