// Role selection on the registration form: it can only ever create a request, never grant a role.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client, signUp } = require('./helpers');

const PREFIX = `test-${Date.now()}`;

(async () => {
  const server = await start(createServer);
  let failed = false;
  try {
    const sup = await signUp(server, db, PREFIX, 'super', 'SUPER_ADMIN');
    const campus = await signUp(server, db, PREFIX, 'campus', 'CAMPUS_ADMIN');
    const reg = async (name, extra) => {
      const api = client(server);
      const r = await api.post('/api/auth/register', { name: `Tester ${name}`, email: `${PREFIX}-${name}@example.test`, password: 'Sup3rSecret1', confirmPassword: 'Sup3rSecret1', ...extra });
      return { api, r };
    };

    // ---- Student is instant; other roles never are
    let { r } = await reg('plain', {});
    assert.equal(r.status, 201);
    assert.equal(r.body.data.roleRequest, null);
    ({ r } = await reg('stud', { requestedRole: 'STUDENT' }));
    assert.equal(r.body.data.user.role, 'STUDENT');
    assert.equal(r.body.data.roleRequest, null, 'choosing student creates no request');
    const fac = await reg('fac', { requestedRole: 'FACULTY' });
    assert.equal(fac.r.status, 201);
    assert.equal(fac.r.body.data.user.role, 'STUDENT', 'account starts as a student');
    assert.deepEqual(fac.r.body.data.roleRequest, { requestedRole: 'FACULTY', status: 'PENDING' });
    assert.deepEqual((await fac.api.get('/api/auth/me')).body.data.user.permissions, [], 'no staff permissions before approval');
    assert.equal((await fac.api.get('/api/manage/leave')).status, 403);

    // ---- Cannot ask for Super Admin or an invalid role, and the plain role field is still ignored
    assert.equal((await reg('sa', { requestedRole: 'SUPER_ADMIN' })).r.status, 400);
    assert.equal((await reg('bad', { requestedRole: 'KING' })).r.status, 400);
    const sneaky = await reg('sneaky', { role: 'SUPER_ADMIN' });
    assert.equal(sneaky.r.body.data.user.role, 'STUDENT');
    assert.equal(await db.roleRequest.count({ where: { user: { email: `${PREFIX}-sneaky@example.test` } } }), 0);
    assert.equal(await db.user.count({ where: { email: `${PREFIX}-sa@example.test` } }), 0, 'a rejected registration creates nothing');

    // ---- Only super admins see and decide requests
    assert.equal((await fac.api.get('/api/admin/role-requests')).status, 403);
    assert.equal((await campus.api.get('/api/admin/role-requests')).status, 403, 'campus admins cannot approve roles');
    assert.equal((await client(server).get('/api/admin/role-requests')).status, 401);
    const list = (await sup.api.get('/api/admin/role-requests')).body.data.requests;
    const req = list.find((x) => x.user.email === `${PREFIX}-fac@example.test`);
    assert.ok(req && req.requestedRole === 'FACULTY');
    assert.ok(await db.notification.findFirst({ where: { userId: sup.id, title: { contains: 'Role request from' } } }), 'super admins are notified');
    assert.equal((await fac.api.post(`/api/admin/role-requests/${req.id}/decision`, { decision: 'approve' })).status, 403, 'cannot approve yourself');
    assert.equal((await sup.api.post(`/api/admin/role-requests/${req.id}/decision`, { decision: 'maybe' })).status, 400);

    // ---- Approval changes the role, ends sessions and is audited
    assert.equal((await sup.api.post(`/api/admin/role-requests/${req.id}/decision`, { decision: 'approve' })).status, 200);
    assert.equal((await db.user.findUnique({ where: { email: `${PREFIX}-fac@example.test` } })).role, 'FACULTY');
    assert.equal((await fac.api.get('/api/auth/me')).status, 401, 'sessions end so the new role is picked up on sign-in');
    assert.equal((await fac.api.post('/api/auth/login', { email: `${PREFIX}-fac@example.test`, password: 'Sup3rSecret1' })).status, 200);
    assert.ok((await fac.api.get('/api/auth/me')).body.data.user.permissions.includes('leave:review'));
    assert.ok(await db.auditLog.findFirst({ where: { action: 'user.role_request.approve' } }));
    assert.ok(await db.notification.findFirst({ where: { userId: req.user.id, title: 'Your role request was approved' } }));
    assert.equal((await sup.api.post(`/api/admin/role-requests/${req.id}/decision`, { decision: 'approve' })).status, 409, 'already decided');

    // ---- Rejection leaves the user a student
    const org = await reg('org', { requestedRole: 'EVENT_ORGANIZER' });
    const orgReq = (await sup.api.get('/api/admin/role-requests')).body.data.requests.find((x) => x.user.email === `${PREFIX}-org@example.test`);
    assert.equal((await sup.api.post(`/api/admin/role-requests/${orgReq.id}/decision`, { decision: 'reject', note: 'Please contact the events office.' })).status, 200);
    assert.equal((await db.user.findUnique({ where: { email: `${PREFIX}-org@example.test` } })).role, 'STUDENT');
    assert.equal((await org.api.get('/api/auth/me')).body.data.user.role, 'STUDENT');
    assert.equal((await sup.api.get('/api/admin/role-requests?status=PENDING')).body.data.requests.some((x) => x.id === orgReq.id), false);
    console.log('Role request tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
