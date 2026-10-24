// Events: discovery, the registration workflow, cancellation, organizer management and authorization.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client, signUp } = require('./helpers');

const PREFIX = `test-${Date.now()}`;
const future = (days, hour = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString().slice(0, 16); };
const form = (extra = {}) => ({ fullName: 'Test Student', registrationNo: '21BCE0001', email: 'student@example.test', department: 'CSE', yearOfStudy: 2, consent: true, confirm: true, ...extra });
const body = (extra = {}) => ({ title: `${PREFIX} Workshop`, description: 'A hands-on test workshop for the suite.', category: 'WORKSHOP', mode: 'IN_PERSON', startsAt: future(10), venue: 'Lab 1', capacity: 2, ...extra });

(async () => {
  execFileSync('node', [path.join(__dirname, '../prisma/seed.js')], { stdio: 'ignore' });
  const server = await start(createServer);
  const anon = client(server);
  let failed = false;
  const created = [];
  try {
    const a = await signUp(server, db, PREFIX, 'a');
    const b = await signUp(server, db, PREFIX, 'b');
    const c = await signUp(server, db, PREFIX, 'c');
    const org = await signUp(server, db, PREFIX, 'org', 'EVENT_ORGANIZER');
    const org2 = await signUp(server, db, PREFIX, 'org2', 'EVENT_ORGANIZER');
    const admin = await signUp(server, db, PREFIX, 'admin', 'CAMPUS_ADMIN');

    // ---- Discovery
    let r = await anon.get('/api/events');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.total >= 5 && r.body.data.events.every((e) => e.status === 'PUBLISHED'));
    assert.ok(r.body.data.events[0].timing === 'upcoming' && 'spotsLeft' in r.body.data.events[0]);
    assert.ok((await anon.get('/api/events?category=WORKSHOP')).body.data.events.every((e) => e.category === 'WORKSHOP'));
    assert.ok((await anon.get('/api/events?q=hackathon')).body.data.events.some((e) => /hackathon/i.test(e.title)));
    assert.equal((await anon.get('/api/events?q=zzzz-no-match')).body.data.total, 0);
    assert.equal((await anon.get('/api/events?when=past')).body.data.events.filter((e) => e.timing !== 'past').length, 0);
    for (const bad of ['category=BOGUS', 'page=0', 'when=never', 'sort=random', 'from=31-12-2026']) assert.equal((await anon.get(`/api/events?${bad}`)).status, 400, bad);
    assert.equal((await anon.get('/api/events/not-a-uuid')).status, 400);
    assert.equal((await anon.get('/api/events/11111111-1111-4111-8111-111111111111')).status, 404);

    // ---- Organizer creates a draft: validation, ownership and lifecycle
    assert.equal((await anon.post('/api/manage/events', body())).status, 401);
    assert.equal((await a.api.post('/api/manage/events', body())).status, 403, 'students cannot create events');
    r = await org.api.post('/api/manage/events', { title: 'x', startsAt: future(-2), category: 'NOPE', capacity: 0, coverImage: 'http://insecure' });
    assert.equal(r.status, 400);
    ['title', 'description', 'category', 'venue', 'capacity', 'coverImage'].forEach((f) => assert.ok(r.body.error.details[f], `error for ${f}`));
    assert.equal((await org.api.post('/api/manage/events', body({ startsAt: future(-2) }))).status, 400, 'start must be in the future');
    assert.ok((await org.api.post('/api/manage/events', body({ endsAt: future(9) }))).body.error.details.endsAt);
    r = await org.api.post('/api/manage/events', body());
    assert.equal(r.status, 201);
    const ev = r.body.data.event;
    created.push(ev.id);
    assert.equal(ev.status, 'DRAFT');
    assert.equal(ev.organizerId, org.id);
    assert.equal((await anon.get(`/api/events/${ev.id}`)).status, 404, 'drafts are hidden from the public');
    assert.equal((await a.api.get(`/api/events/${ev.id}`)).status, 404);
    assert.equal((await org.api.get(`/api/events/${ev.id}`)).status, 200, 'organizer can preview their draft');
    assert.equal((await a.api.post(`/api/events/${ev.id}/register`, form())).status, 400, 'cannot register for an unpublished event');

    // another organizer cannot touch it, an admin can
    assert.equal((await org2.api.get(`/api/manage/events/${ev.id}`)).status, 403);
    assert.equal((await org2.api.put(`/api/manage/events/${ev.id}`, body())).status, 403);
    assert.equal((await org2.api.post(`/api/manage/events/${ev.id}/publish`)).status, 403);
    assert.equal((await admin.api.get(`/api/manage/events/${ev.id}`)).status, 200);
    assert.equal((await org2.api.get('/api/manage/events')).body.data.events.some((e) => e.id === ev.id), false, 'lists are scoped to own events');

    r = await org.api.put(`/api/manage/events/${ev.id}`, body({ title: `${PREFIX} Workshop v2` }));
    assert.equal(r.body.data.event.title, `${PREFIX} Workshop v2`);
    assert.equal((await org.api.post(`/api/manage/events/${ev.id}/unpublish`)).status, 409, 'drafts cannot be unpublished');
    assert.equal((await org.api.post(`/api/manage/events/${ev.id}/publish`)).status, 200);
    assert.equal((await org.api.post(`/api/manage/events/${ev.id}/publish`)).status, 409, 'double publish');
    assert.equal((await org.api.del(`/api/manage/events/${ev.id}`)).status, 409, 'published events cannot be deleted');

    // ---- Registration workflow
    assert.equal((await anon.post(`/api/events/${ev.id}/register`, form())).status, 401);
    r = await a.api.post(`/api/events/${ev.id}/register`, {});
    assert.equal(r.status, 400);
    ['fullName', 'registrationNo', 'email', 'department', 'yearOfStudy', 'consent', 'confirm'].forEach((f) => assert.ok(r.body.error.details[f], `error for ${f}`));
    assert.equal((await a.api.post(`/api/events/${ev.id}/register`, form({ confirm: false }))).status, 400, 'needs the review confirmation');
    assert.equal((await a.api.post(`/api/events/${ev.id}/register`, form({ yearOfStudy: 12 }))).status, 400);
    r = await a.api.post(`/api/events/${ev.id}/register`, form());
    assert.equal(r.status, 201);
    assert.match(r.body.data.registration.referenceNo, /^REG-\d{4}-[A-Z0-9]{6}$/);
    assert.equal(r.body.data.event.registered, true);
    assert.equal((await a.api.post(`/api/events/${ev.id}/register`, form())).body.error.code, 'ALREADY_REGISTERED');
    assert.equal((await b.api.post(`/api/events/${ev.id}/register`, form({ fullName: 'Second Student' }))).status, 201);
    r = await c.api.post(`/api/events/${ev.id}/register`, form());
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'EVENT_FULL');
    assert.equal((await c.api.get(`/api/events/${ev.id}`)).body.data.event.registrationNote, 'This event is full.');

    // my events + ownership of cancellation
    assert.equal((await a.api.get('/api/events/mine')).body.data.registrations.length, 1);
    assert.equal((await c.api.get('/api/events/mine')).body.data.registrations.length, 0);
    assert.equal((await c.api.del(`/api/events/${ev.id}/register`)).status, 404, "c cannot cancel someone else's registration");
    assert.equal(await db.eventRegistration.count({ where: { eventId: ev.id, status: 'REGISTERED' } }), 2);

    // cancellation frees the seat and re-registration reuses the record
    r = await a.api.del(`/api/events/${ev.id}/register`);
    assert.equal(r.status, 200);
    const refA = r.body.data.registration.referenceNo;
    assert.equal((await a.api.del(`/api/events/${ev.id}/register`)).status, 404, 'double cancel');
    assert.equal((await c.api.post(`/api/events/${ev.id}/register`, form())).status, 201, 'freed seat can be taken');
    assert.equal((await a.api.post(`/api/events/${ev.id}/register`, form())).body.error.code, 'EVENT_FULL');
    await c.api.del(`/api/events/${ev.id}/register`);
    r = await a.api.post(`/api/events/${ev.id}/register`, form());
    assert.equal(r.status, 201);
    assert.equal(r.body.data.registration.referenceNo, refA, 're-registration keeps the reference');
    assert.equal(await db.eventRegistration.count({ where: { eventId: ev.id, userId: a.id } }), 1, 'no duplicate rows');

    // ---- Notifications from real state changes
    const notes = await db.notification.findMany({ where: { userId: a.id, type: 'EVENT' } });
    assert.ok(notes.length >= 3 && notes.every((n) => n.link === `/events/${ev.id}`));

    // ---- Attendees, attendance, export, capacity guard
    assert.equal((await a.api.get(`/api/manage/events/${ev.id}/registrations`)).status, 403);
    r = await org.api.get(`/api/manage/events/${ev.id}/registrations`);
    assert.equal(r.body.data.total, 3, 'a (re-registered, one row), b and c (cancelled)');
    assert.equal(r.body.data.stats.registered, 2);
    assert.equal((await org.api.get(`/api/manage/events/${ev.id}/registrations?status=REGISTERED&q=second`)).body.data.registrations.length, 1);
    const regA = (await org.api.get(`/api/manage/events/${ev.id}/registrations?status=REGISTERED`)).body.data.registrations.find((x) => x.userId === a.id);
    assert.equal((await org2.api.post(`/api/manage/events/${ev.id}/registrations/${regA.id}/attendance`, { attended: true })).status, 403);
    assert.equal((await org.api.post(`/api/manage/events/${ev.id}/registrations/${regA.id}/attendance`, { attended: 'yes' })).status, 400);
    r = await org.api.post(`/api/manage/events/${ev.id}/registrations/${regA.id}/attendance`, { attended: true });
    assert.equal(r.body.data.stats.attended, 1);
    await db.eventRegistration.update({ where: { id: regA.id }, data: { fullName: '=HYPERLINK("http://evil")' } });
    assert.equal((await anon.get(`/api/manage/events/${ev.id}/export.csv`)).status, 401, 'export requires a session');
    assert.equal((await a.api.get(`/api/manage/events/${ev.id}/export.csv`)).status, 403);
    assert.equal((await org2.api.get(`/api/manage/events/${ev.id}/export.csv`)).status, 403);
    r = await org.api.get(`/api/manage/events/${ev.id}/export.csv`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/csv/);
    assert.ok(r.text.includes('"\'=HYPERLINK'), 'formula cells are neutralised');
    assert.ok(r.text.split('\r\n')[0].includes('Reference'));
    r = await org.api.put(`/api/manage/events/${ev.id}`, body({ capacity: 1 }));
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.capacity);

    // ---- Cancelling the event notifies attendees and blocks registration
    assert.equal((await org.api.post(`/api/manage/events/${ev.id}/cancel`, { reason: 'x' })).status, 400);
    r = await org.api.post(`/api/manage/events/${ev.id}/cancel`, { reason: 'Venue unavailable' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.event.status, 'CANCELLED');
    assert.ok(await db.notification.findFirst({ where: { userId: b.id, title: { startsWith: 'Event cancelled' } } }), 'attendees are notified');
    assert.equal((await c.api.post(`/api/events/${ev.id}/register`, form())).status, 400);
    assert.equal((await org.api.put(`/api/manage/events/${ev.id}`, body())).status, 409);
    assert.equal((await org.api.post(`/api/manage/events/${ev.id}/cancel`, { reason: 'again again' })).status, 409);

    // ---- Registration window and ended events
    const win = (await org.api.post('/api/manage/events', body({ title: `${PREFIX} windowed`, registrationOpensAt: future(3), registrationClosesAt: future(9) }))).body.data.event;
    created.push(win.id);
    await org.api.post(`/api/manage/events/${win.id}/publish`);
    r = await a.api.post(`/api/events/${win.id}/register`, form());
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'REGISTRATION_CLOSED');
    assert.equal((await org.api.post('/api/manage/events', body({ registrationOpensAt: future(9), registrationClosesAt: future(5) }))).status, 400);
    const past = await db.event.create({ data: { title: `${PREFIX} past`, description: 'old event for testing', category: 'WORKSHOP', status: 'PUBLISHED', startsAt: new Date(Date.now() - 864e5), venue: 'x', isDemo: false } });
    created.push(past.id);
    assert.equal((await a.api.post(`/api/events/${past.id}/register`, form())).status, 400);

    // ---- Symposium-specific fields
    const symp = (await org.api.post('/api/manage/events', body({ title: `${PREFIX} symposium`, category: 'SYMPOSIUM', capacity: 50 }))).body.data.event;
    created.push(symp.id);
    await org.api.post(`/api/manage/events/${symp.id}/publish`);
    r = await a.api.post(`/api/events/${symp.id}/register`, form());
    assert.ok(r.body.error.details.teamSize && r.body.error.details.track);
    assert.equal((await a.api.post(`/api/events/${symp.id}/register`, form({ teamSize: 9, track: 'Quiz' }))).status, 400);
    r = await a.api.post(`/api/events/${symp.id}/register`, form({ teamSize: 2, track: 'Quiz' }));
    assert.equal(r.status, 201);
    assert.equal(r.body.data.registration.teamSize, 2);

    // ---- Race: two simultaneous requests for the last seat
    const race = (await org.api.post('/api/manage/events', body({ title: `${PREFIX} race`, capacity: 1 }))).body.data.event;
    created.push(race.id);
    await org.api.post(`/api/manage/events/${race.id}/publish`);
    const results = await Promise.all([a.api.post(`/api/events/${race.id}/register`, form()), b.api.post(`/api/events/${race.id}/register`, form())]);
    assert.equal(results.filter((x) => x.status === 201).length, 1);
    assert.equal(await db.eventRegistration.count({ where: { eventId: race.id, status: 'REGISTERED' } }), 1);

    // ---- Audit trail
    const actions = new Set((await db.auditLog.findMany({ where: { entityId: ev.id } })).map((l) => l.action));
    assert.ok(actions.has('event.publish') && actions.has('event.cancel') && actions.has('event.export'));
    assert.equal(JSON.stringify(await db.auditLog.findMany({ where: { entityId: ev.id } })).includes('Sup3rSecret1'), false);

    // ---- Draft deletion
    const d = (await org.api.post('/api/manage/events', body({ title: `${PREFIX} to delete` }))).body.data.event;
    assert.equal((await org2.api.del(`/api/manage/events/${d.id}`)).status, 403);
    assert.equal((await org.api.del(`/api/manage/events/${d.id}`)).status, 200);
    console.log('Events tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.event.deleteMany({ where: { OR: [{ id: { in: created } }, { title: { startsWith: PREFIX } }] } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
