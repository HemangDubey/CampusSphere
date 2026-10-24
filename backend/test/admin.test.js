// Administration: role matrix, user and role management, audit log, reports, content CRUD, announcements,
// notifications, dashboard summary and game scores.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client, signUp } = require('./helpers');

const PREFIX = `test-${Date.now()}`;
const U = '11111111-1111-4111-8111-111111111111';

(async () => {
  execFileSync('node', [path.join(__dirname, '../prisma/seed.js')], { stdio: 'ignore' });
  const server = await start(createServer);
  const anon = client(server);
  let failed = false;
  const made = { dest: [], cat: [], res: [], ann: [] };
  try {
    const roles = {};
    for (const [key, role] of [['student', 'STUDENT'], ['faculty', 'FACULTY'], ['org', 'EVENT_ORGANIZER'], ['health', 'HEALTHCARE_ADMIN'], ['campus', 'CAMPUS_ADMIN'], ['super', 'SUPER_ADMIN']]) roles[key] = await signUp(server, db, PREFIX, key, role);

    // ---- /auth/me exposes the permission list for the UI (the server still enforces everything)
    let r = await roles.org.api.get('/api/auth/me');
    assert.deepEqual(r.body.data.user.permissions, ['event:manage']);
    assert.ok(!('passwordHash' in r.body.data.user));
    assert.deepEqual((await roles.student.api.get('/api/auth/me')).body.data.user.permissions, []);
    assert.ok((await roles.super.api.get('/api/auth/me')).body.data.user.permissions.includes('user:manage'));

    // ---- Permission matrix: role -> endpoint -> expected status class
    const checks = [
      ['GET /api/admin/users', ['super']], ['GET /api/admin/audit', ['super', 'campus']], ['GET /api/admin/reports', ['super', 'campus']],
      ['GET /api/admin/destinations', ['super', 'campus']], ['GET /api/admin/announcements', ['super', 'campus']],
      ['GET /api/admin/categories', ['super', 'campus']], ['GET /api/admin/resources', ['super', 'campus']],
      ['GET /api/manage/events', ['super', 'campus', 'org']], ['GET /api/manage/leave', ['super', 'campus', 'faculty']],
      ['GET /api/manage/requests', ['super', 'campus', 'faculty']], ['GET /api/manage/healthcare/appointments', ['super', 'health']],
      ['GET /api/employees', ['super', 'campus']]
    ];
    for (const [call, allowed] of checks) {
      const [method, url] = call.split(' ');
      assert.equal((await anon.raw(method, url)).status, 401, `${call} anonymous`);
      for (const [key, who] of Object.entries(roles)) {
        const st = (await who.api.raw(method, url)).status;
        assert.equal(st === 200, allowed.includes(key), `${call} as ${key} gave ${st}`);
        if (!allowed.includes(key)) assert.equal(st, 403, `${call} as ${key} must be forbidden, got ${st}`);
      }
    }

    // ---- Users and roles
    r = await roles.super.api.get('/api/admin/users?q=tester');
    assert.ok(r.body.data.total >= 6 && r.body.data.roles.length === 6);
    assert.equal((await roles.super.api.get('/api/admin/users?role=NOPE')).status, 400);
    assert.ok((await roles.super.api.get('/api/admin/users?role=FACULTY')).body.data.users.every((u) => u.role === 'FACULTY'));
    const target = roles.student;
    assert.equal((await roles.campus.api.patch(`/api/admin/users/${target.id}`, { role: 'FACULTY' })).status, 403, 'campus admins cannot change roles');
    assert.equal((await roles.student.api.patch(`/api/admin/users/${target.id}`, { role: 'SUPER_ADMIN' })).status, 403, 'students cannot promote themselves');
    assert.equal((await roles.super.api.patch(`/api/admin/users/${roles.super.id}`, { role: 'STUDENT' })).status, 409, 'cannot change your own role');
    assert.equal((await roles.super.api.patch(`/api/admin/users/${target.id}`, { role: 'KING' })).status, 400);
    assert.equal((await roles.super.api.patch(`/api/admin/users/${target.id}`, {})).status, 400);
    assert.equal((await roles.super.api.patch(`/api/admin/users/${U}`, { role: 'FACULTY' })).status, 404);
    // public registration can never create a staff role
    const sneaky = client(server);
    r = await sneaky.post('/api/auth/register', { name: 'Sneaky Admin', email: `${PREFIX}-sneaky@example.test`, password: 'Sup3rSecret1', confirmPassword: 'Sup3rSecret1', role: 'SUPER_ADMIN' });
    assert.equal(r.body.data.user.role, 'STUDENT', 'registration ignores any role field');
    assert.equal((await sneaky.patch('/api/auth/me', { role: 'SUPER_ADMIN', status: 'ACTIVE' })).body.data.user.role, 'STUDENT', 'profile update cannot change the role');

    // role change takes effect immediately by ending sessions
    const mover = await signUp(server, db, PREFIX, 'mover');
    assert.equal((await mover.api.get('/api/auth/me')).status, 200);
    assert.equal((await roles.super.api.patch(`/api/admin/users/${mover.id}`, { role: 'FACULTY' })).body.data.user.role, 'FACULTY');
    assert.equal((await mover.api.get('/api/auth/me')).status, 401, 'old sessions are revoked after a role change');
    assert.equal((await mover.api.post('/api/auth/login', { email: mover.email, password: 'Sup3rSecret1' })).body.data.user.role, 'FACULTY');
    // suspension
    assert.equal((await roles.super.api.patch(`/api/admin/users/${mover.id}`, { status: 'SUSPENDED' })).body.data.user.status, 'SUSPENDED');
    assert.equal((await mover.api.get('/api/auth/me')).status, 401);
    r = await mover.api.post('/api/auth/login', { email: mover.email, password: 'Sup3rSecret1' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'ACCOUNT_SUSPENDED');
    assert.equal((await mover.api.post('/api/auth/login', { email: mover.email, password: 'wrong-Pass1' })).status, 401, 'wrong passwords still get the generic error');
    assert.equal((await roles.super.api.patch(`/api/admin/users/${mover.id}`, { status: 'ACTIVE' })).status, 200);
    assert.equal((await mover.api.post('/api/auth/login', { email: mover.email, password: 'Sup3rSecret1' })).status, 200);
    // One super administrator can demote another. This suite only ever changes its own test accounts, never real ones.
    // (The server also refuses to remove the last active super administrator; that guard cannot be reached through the API
    // because only a super administrator may change roles, so it is not asserted here.)
    const second = await signUp(server, db, PREFIX, 'super2', 'SUPER_ADMIN');
    assert.equal((await second.api.patch(`/api/admin/users/${roles.super.id}`, { role: 'STUDENT' })).status, 200, 'with two super admins one can demote the other');
    assert.equal((await roles.super.api.get('/api/admin/users')).status, 401, 'the demoted admin is signed out immediately');
    roles.super = second;

    // ---- Audit log
    r = await roles.campus.api.get('/api/admin/audit?entityType=User');
    assert.ok(r.body.data.logs.some((l) => l.action === 'user.role' && l.summary.includes('->')));
    assert.ok(r.body.data.logs.every((l) => !JSON.stringify(l).match(/passwordHash|Sup3rSecret1/)), 'no secrets in the audit log');
    assert.ok((await roles.campus.api.get('/api/admin/audit?q=suspended')).body.data.logs.length >= 1);
    assert.equal((await roles.campus.api.post('/api/admin/audit', {})).status, 404, 'audit logs are read-only');

    // ---- Content management: destinations
    const dest = (o = {}) => ({ name: 'Test Falls', slug: `${PREFIX}-falls`, region: 'Test Region', type: 'NATURE', budget: 'BUDGET', summary: 'A test destination.', description: 'A longer description for the automated test destination.', budgetMinInr: 500, budgetMaxInr: 900, recommendedDays: 1, distanceKm: 50, tips: 'Carry water\nStart early', activities: 'Walk\nPicnic', gallery: '', ...o });
    assert.equal((await roles.student.api.post('/api/admin/destinations', dest())).status, 403);
    r = await roles.campus.api.post('/api/admin/destinations', { name: 'x' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.slug && r.body.error.details.description);
    assert.ok((await roles.campus.api.post('/api/admin/destinations', dest({ budgetMaxInr: 100 }))).body.error.details.budgetMaxInr);
    assert.ok((await roles.campus.api.post('/api/admin/destinations', dest({ slug: 'Bad Slug' }))).body.error.details.slug);
    assert.ok((await roles.campus.api.post('/api/admin/destinations', dest({ gallery: 'http://insecure.example/x.jpg' }))).body.error.details.gallery);
    r = await roles.campus.api.post('/api/admin/destinations', dest());
    assert.equal(r.status, 201);
    const d = r.body.data.destination;
    made.dest.push(d.id);
    assert.deepEqual(d.tips, ['Carry water', 'Start early']);
    assert.equal((await roles.campus.api.post('/api/admin/destinations', dest())).status, 409, 'duplicate slug');
    assert.equal((await anon.get(`/api/destinations/${d.slug}`)).status, 200, 'new content is visible to students');
    assert.equal((await roles.campus.api.put(`/api/admin/destinations/${d.id}`, dest({ published: false }))).body.data.destination.published, false);
    assert.equal((await anon.get(`/api/destinations/${d.slug}`)).status, 404, 'unpublished content is hidden');
    assert.equal((await roles.campus.api.put(`/api/admin/destinations/${U}`, dest({ slug: 'other' }))).status, 404);
    assert.equal((await roles.campus.api.get(`/api/admin/destinations?q=test%20falls`)).body.data.destinations.length, 1);
    assert.equal((await roles.campus.api.del(`/api/admin/destinations/${d.id}`)).status, 200);
    assert.equal((await roles.campus.api.del(`/api/admin/destinations/${d.id}`)).status, 404);

    // ---- Categories and resources
    assert.equal((await roles.student.api.post('/api/admin/categories', { name: 'Hack' })).status, 403);
    assert.ok((await roles.campus.api.post('/api/admin/categories', { name: 'x' })).body.error.details.name);
    r = await roles.campus.api.post('/api/admin/categories', { name: `${PREFIX} Category`, description: 'for tests' });
    const cat = r.body.data.category;
    made.cat.push(cat.id);
    assert.equal(r.status, 201);
    assert.equal((await roles.campus.api.post('/api/admin/categories', { name: `${PREFIX} Category` })).status, 409);
    assert.equal((await roles.campus.api.put(`/api/admin/categories/${cat.id}`, { name: `${PREFIX} Category 2` })).body.data.category.name, `${PREFIX} Category 2`);
    const fields = [{ name: 'topic', label: 'Topic', type: 'text', required: true }, { name: 'kind', label: 'Kind', type: 'select', required: false, options: ['A', 'B'] }];
    const res = (o = {}) => ({ kind: 'SERVICE', title: `${PREFIX} Service`, summary: 'A test service.', status: 'AVAILABLE', categoryId: cat.id, acceptsRequests: true, formFields: fields, requiredDocuments: 'ID card\nForm A', ...o });
    r = await roles.campus.api.post('/api/admin/resources', res({ formFields: '[{"name":"x"}]' }));
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.formFields);
    assert.ok((await roles.campus.api.post('/api/admin/resources', res({ formFields: undefined }))).body.error.details.formFields, 'requestable resources need form fields');
    assert.ok((await roles.campus.api.post('/api/admin/resources', res({ imageUrl: 'javascript:alert(1)' }))).body.error.details.imageUrl);
    assert.ok((await roles.campus.api.post('/api/admin/resources', res({ categoryId: U }))).body.error.details.categoryId);
    r = await roles.campus.api.post('/api/admin/resources', res());
    assert.equal(r.status, 201);
    const rsc = r.body.data.resource;
    made.res.push(rsc.id);
    assert.deepEqual(rsc.requiredDocuments, ['ID card', 'Form A']);
    assert.equal((await anon.get(`/api/resources/${rsc.id}`)).status, 200);
    // a student can use the admin-defined form
    const stud = roles.student;
    assert.equal((await stud.api.post('/api/service-requests', { resourceId: rsc.id, confirm: true, data: { kind: 'C' } })).status, 400);
    r = await stud.api.post('/api/service-requests', { resourceId: rsc.id, confirm: true, data: { topic: 'Hello', kind: 'A' } });
    assert.equal(r.status, 201);
    assert.equal((await roles.campus.api.del(`/api/admin/categories/${cat.id}`)).status, 409, 'category in use');
    assert.equal((await roles.campus.api.del(`/api/admin/resources/${rsc.id}`)).status, 409, 'resource with requests cannot be deleted');
    assert.equal((await roles.campus.api.put(`/api/admin/resources/${rsc.id}`, res({ published: false }))).body.data.resource.published, false);
    assert.equal((await anon.get(`/api/resources/${rsc.id}`)).status, 404);
    assert.equal((await stud.api.post('/api/service-requests', { resourceId: rsc.id, confirm: true, data: { topic: 'Again' } })).status, 404, 'unpublished resources take no new requests');
    await db.serviceRequest.deleteMany({ where: { resourceId: rsc.id } });
    assert.equal((await roles.campus.api.del(`/api/admin/resources/${rsc.id}`)).status, 200);
    assert.equal((await roles.campus.api.del(`/api/admin/categories/${cat.id}`)).status, 200);

    // ---- Announcements
    assert.equal((await roles.student.api.post('/api/admin/announcements', { title: 'Hi there', body: 'Some body text here' })).status, 403);
    assert.ok((await roles.campus.api.post('/api/admin/announcements', { title: 'x', body: 'y' })).body.error.details.title);
    r = await roles.campus.api.post('/api/admin/announcements', { title: `${PREFIX} Notice`, body: 'A test announcement body.', status: 'DRAFT' });
    const ann = r.body.data.announcement;
    made.ann.push(ann.id);
    assert.equal(ann.status, 'DRAFT');
    assert.equal((await anon.get('/api/announcements')).body.data.announcements.some((x) => x.id === ann.id), false, 'drafts are not public');
    assert.equal((await roles.campus.api.put(`/api/admin/announcements/${ann.id}`, { title: `${PREFIX} Notice`, body: 'A test announcement body.', status: 'PUBLISHED' })).body.data.announcement.status, 'PUBLISHED');
    assert.equal((await anon.get('/api/announcements')).body.data.announcements.some((x) => x.id === ann.id), true);
    assert.equal((await roles.campus.api.del(`/api/admin/announcements/${ann.id}`)).status, 200);
    assert.equal((await roles.campus.api.del(`/api/admin/announcements/${ann.id}`)).status, 404);

    // ---- Reports
    r = await roles.campus.api.get('/api/admin/reports');
    assert.ok(r.body.data.users.STUDENT >= 1 && 'overdue' in r.body.data.serviceRequests && Array.isArray(r.body.data.topEvents));
    assert.equal(typeof r.body.data.registrationsByCategory, 'object');

    // ---- Notifications
    const n = roles.faculty;
    await db.notification.createMany({ data: [1, 2, 3].map((i) => ({ userId: n.id, type: 'SYSTEM', title: `n${i}` })) });
    assert.equal((await anon.get('/api/notifications')).status, 401);
    r = await n.api.get('/api/notifications');
    assert.equal(r.body.data.unread, 3);
    assert.equal((await n.api.get('/api/notifications/unread-count')).body.data.unread, 3);
    const first = r.body.data.notifications[0];
    assert.equal((await roles.student.api.post(`/api/notifications/${first.id}/read`)).status, 404, "cannot read someone else's notification");
    assert.equal((await n.api.post(`/api/notifications/${first.id}/read`)).body.data.unread, 2);
    assert.equal((await n.api.post(`/api/notifications/${first.id}/read`)).status, 200, 'marking twice is harmless');
    assert.equal((await n.api.get('/api/notifications?unread=true')).body.data.notifications.length, 2);
    assert.equal((await n.api.post('/api/notifications/read-all')).body.data.unread, 0);
    assert.equal((await n.api.post(`/api/notifications/${U}/read`)).status, 404);
    assert.equal((await roles.student.api.get('/api/notifications/unread-count')).body.data.unread >= 0, true);

    // ---- Dashboard summary only contains the caller's data
    r = await roles.student.api.get('/api/dashboard');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.profile.completeness >= 0 && r.body.data.profile.completeness <= 100 && r.body.data.counts && Array.isArray(r.body.data.announcements));
    assert.equal(r.body.data.work, null, 'students have no staff workload');
    assert.ok((await roles.campus.api.get('/api/dashboard')).body.data.work.leavesToReview >= 0);
    assert.equal((await anon.get('/api/dashboard')).status, 401);
    assert.ok(Array.isArray((await roles.student.api.get('/api/activity')).body.data.activity));

    // ---- Games
    assert.equal((await anon.get('/api/games')).body.data.games.length, 6);
    assert.equal((await anon.post('/api/games/scores', { game: 'memory', score: 100 })).status, 401);
    const s = (o) => roles.student.api.post('/api/games/scores', { game: 'memory', difficulty: 'normal', score: 400, ...o });
    for (const bad of [{ game: 'poker' }, { score: -1 }, { score: 2.5 }, { score: 999999 }, { score: '400' }, { difficulty: 'insane' }, { meta: 'x'.repeat(600) }]) assert.equal((await s(bad)).status, 400, JSON.stringify(bad).slice(0, 40));
    r = await s({});
    assert.equal(r.status, 201);
    assert.equal(r.body.data.isNewBest, true);
    assert.equal((await s({ score: 300 })).body.data.isNewBest, false);
    assert.equal((await s({ score: 500, meta: { moves: 14 } })).body.data.personalBest, 500);
    const mine = (await roles.student.api.get('/api/games/scores/mine')).body.data.bests.find((x) => x.game === 'memory' && x.difficulty === 'normal');
    assert.deepEqual([mine.best, mine.plays], [500, 3]);
    assert.equal((await roles.faculty.api.get('/api/games/scores/mine')).body.data.bests.length, 0, 'personal bests are private');
    await roles.faculty.api.post('/api/games/scores', { game: 'memory', difficulty: 'normal', score: 500 });
    await roles.org.api.post('/api/games/scores', { game: 'memory', difficulty: 'normal', score: 350 });
    r = await anon.get('/api/games/leaderboard?game=memory&difficulty=normal');
    const entries = r.body.data.entries;
    assert.equal(entries[0].score, 500);
    assert.deepEqual(entries.map((e) => e.rank), entries.map((_, i) => i + 1));
    assert.ok(entries.findIndex((e) => e.name === 'Tester') >= 0 && entries.every((e) => !('userId' in e) && !('email' in e)), 'only first names and scores are exposed');
    assert.equal(entries.filter((e) => e.score === 500).length >= 2, true);
    assert.ok(r.body.data.rule.includes('best score'));
    assert.equal((await anon.get('/api/games/leaderboard')).status, 400);
    assert.equal((await anon.get('/api/games/leaderboard?game=memory&difficulty=hard')).body.data.entries.length >= 0, true);
    console.log('Admin tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.destination.deleteMany({ where: { id: { in: made.dest } } });
    await db.announcement.deleteMany({ where: { id: { in: made.ann } } });
    await db.serviceRequest.deleteMany({ where: { resourceId: { in: made.res } } });
    await db.resource.deleteMany({ where: { id: { in: made.res } } });
    await db.resourceCategory.deleteMany({ where: { id: { in: made.cat } } });
    await db.leaveRequest.deleteMany({ where: { OR: [{ student: { email: { startsWith: PREFIX } } }, { reviewer: { email: { startsWith: PREFIX } } }] } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.auditLog.deleteMany({ where: { summary: { contains: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
