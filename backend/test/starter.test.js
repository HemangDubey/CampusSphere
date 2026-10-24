// Starter content: re-running the seed adds nothing, no placeholder wording reaches the UI or API, and each role
// sees connected data. Skipped when the local role accounts do not exist (see `npm run dev:accounts`).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client } = require('./helpers');
const { main } = require('../prisma/seed-activity');

const TABLES = ['event', 'eventRegistration', 'trip', 'tripItem', 'resource', 'serviceRequest', 'leaveRequest', 'appointment', 'club', 'clubMember', 'communityPost', 'communityComment', 'postLike', 'notification', 'gameScore', 'readingListItem', 'statusHistory', 'announcement', 'healthSlot'];
const BAD = /sample|fictional|demonstrat|made-up|placeholder|\bdemo\b|demo data/i;

(async () => {
  const server = await start(createServer);
  let failed = false;
  try {
    if ((await db.user.count({ where: { email: { endsWith: '@campussphere.test' } } })) < 6) { console.log('Starter content tests skipped (run npm run dev:accounts first)'); return; }
    await main();
    const snapshot = async () => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await db[t].count()])));
    const before = await snapshot();
    await main();
    assert.deepEqual(await snapshot(), before, 're-running the seed must not create duplicates');

    // ---- No placeholder wording in what the app serves
    const anon = client(server);
    const urls = ['/api/events?pageSize=50', '/api/destinations?pageSize=50', '/api/resources?pageSize=100', '/api/announcements', '/api/healthcare/services'];
    for (const u of urls) {
      const r = await anon.get(u);
      assert.equal(r.status, 200, u);
      const m = JSON.stringify(r.body.data).match(BAD);
      assert.equal(m, null, `${u} contains placeholder wording: ${m && m[0]}`);
    }
    for (const file of ['frontend/js/kit.js', 'frontend/js/ui.js']) assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8'), /Demo data|class="badge badge--sample"/);

    // ---- Every role signs in and sees something real
    const login = async (email, role) => {
      const api = client(server);
      const pw = (fs.readFileSync(path.resolve(__dirname, '../dev-accounts.txt'), 'utf8').match(/Password for all: (\S+)/) || [])[1];
      if (!pw) return null;
      const r = await api.post('/api/auth/login', { email, password: pw });
      if (r.status !== 200 || r.body.data.user.role !== role) { console.log(`  skipped ${email}: account is suspended or its role was changed`); return null; }
      return api;
    };
    const student = await login('student@campussphere.test', 'STUDENT');
    if (student) assert.ok(JSON.stringify((await student.get('/api/dashboard')).body.data).length > 200);
    if (student) assert.ok((await student.get('/api/events/mine')).body.data.registrations.length >= 2, 'student has registrations');
    if (student) assert.ok((await student.get('/api/trips')).body.data.trips.length >= 2, 'student has trips');
    if (student) assert.ok((await student.get('/api/service-requests/mine')).body.data.requests.length >= 3, 'student has requests');
    if (student) assert.ok((await student.get('/api/leave/mine')).body.data.leaves.length >= 2, 'student has leave requests');
    if (student) assert.ok((await student.get('/api/healthcare/appointments/mine')).body.data.appointments.length >= 1, 'student has appointments');
    if (student) assert.ok((await student.get('/api/reading-list')).body.data.items.length >= 3, 'student has a reading list');
    if (student) assert.ok((await student.get('/api/notifications')).body.data.notifications.length >= 3, 'student has notifications');
    if (student) assert.ok((await student.get('/api/community/posts')).body.data.total >= 5, 'community has posts');
    if (student) assert.ok((await student.get('/api/community/groups')).body.data.total >= 3, 'community has groups');
    if (student) assert.ok((await student.get('/api/games/scores/mine')).body.data.bests.length >= 1, 'student has game scores');

    const faculty = await login('faculty@campussphere.test', 'FACULTY');
    if (faculty) assert.ok((await faculty.get('/api/manage/leave')).body.data.leaves.length >= 1, 'faculty has leave to review');
    const campus = await login('campus.admin@campussphere.test', 'CAMPUS_ADMIN');
    if (campus) assert.ok((await campus.get('/api/manage/requests')).body.data.requests.length >= 1, 'campus admin has requests to review');
    const health = await login('healthcare.admin@campussphere.test', 'HEALTHCARE_ADMIN');
    if (health) assert.ok((await health.get('/api/manage/healthcare/appointments')).body.data.appointments.length >= 1, 'healthcare admin has appointments');
    const org = await login('event.organizer@campussphere.test', 'EVENT_ORGANIZER');
    if (org) assert.ok((await org.get('/api/manage/events')).body.data.events.length >= 3, 'organizer owns events');
    const sup = await login('super.admin@campussphere.test', 'SUPER_ADMIN');
    if (sup) assert.ok((await sup.get('/api/admin/users')).body.data.total >= 6, 'super admin sees users');
    console.log('Starter content tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
