// Resources, bookmarks, reading list, and the service-request workflow (submit, review, decide, track).
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
  const made = [];
  try {
    const a = await signUp(server, db, PREFIX, 'a');
    const b = await signUp(server, db, PREFIX, 'b');
    const faculty = await signUp(server, db, PREFIX, 'fac', 'FACULTY');
    const faculty2 = await signUp(server, db, PREFIX, 'fac2', 'FACULTY');
    const admin = await signUp(server, db, PREFIX, 'admin', 'CAMPUS_ADMIN');

    // ---- Directory
    let r = await anon.get('/api/resources?kind=LIBRARY');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.resources.length >= 5 && r.body.data.resources.every((x) => x.kind === 'LIBRARY' && x.published));
    const cats = (await anon.get('/api/resource-categories?kind=LIBRARY')).body.data.categories;
    assert.ok(cats.some((c) => c.name === 'Library'));
    assert.ok((await anon.get(`/api/resources?categoryId=${cats[0].id}`)).body.data.resources.length >= 1);
    assert.ok((await anon.get('/api/resources?q=algorithms')).body.data.resources.some((x) => /Algorithms/.test(x.title)));
    assert.ok((await anon.get('/api/resources?q=cormen')).body.data.resources.length >= 1, 'search covers the author');
    assert.ok((await anon.get('/api/resources?requestable=true')).body.data.resources.every((x) => x.acceptsRequests));
    assert.equal((await anon.get('/api/resources?q=zzzz-none')).body.data.total, 0);
    for (const bad of ['kind=NOPE', 'status=GONE', 'pageSize=5000', 'categoryId=x']) assert.equal((await anon.get(`/api/resources?${bad}`)).status, 400, bad);
    const book = (await anon.get('/api/resources?q=clean%20code')).body.data.resources[0];
    r = await anon.get(`/api/resources/${book.id}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.data.related.length >= 1);
    assert.equal((await anon.get(`/api/resources/${U}`)).status, 404);

    // ---- Bookmarks and reading list
    assert.equal((await anon.raw('PUT', `/api/resources/${book.id}/bookmark`)).status, 401);
    assert.equal((await a.api.put(`/api/resources/${book.id}/bookmark`)).status, 201);
    assert.equal((await a.api.put(`/api/resources/${book.id}/bookmark`)).status, 201);
    assert.equal(await db.resourceBookmark.count({ where: { userId: a.id } }), 1, 'no duplicate bookmarks');
    assert.equal((await a.api.get(`/api/resources/${book.id}`)).body.data.resource.bookmarked, true);
    assert.equal((await b.api.get('/api/resources/bookmarks')).body.data.resources.length, 0, 'bookmarks are private');
    assert.equal((await a.api.get('/api/resources/bookmarks')).body.data.resources.length, 1);
    assert.equal((await a.api.put(`/api/resources/${U}/bookmark`)).status, 404);
    assert.equal((await a.api.put(`/api/reading-list/${book.id}`, { status: 'READING' })).status, 201);
    assert.equal((await a.api.put(`/api/reading-list/${book.id}`, { status: 'FINISHED' })).status, 400);
    assert.equal((await a.api.get('/api/reading-list')).body.data.items[0].status, 'READING');
    assert.equal((await b.api.get('/api/reading-list')).body.data.items.length, 0);
    const dept = (await anon.get('/api/resources?kind=DEPARTMENT')).body.data.resources[0];
    assert.equal((await a.api.put(`/api/reading-list/${dept.id}`, { status: 'READING' })).status, 400, 'only library items can be on a reading list');
    assert.equal((await a.api.del(`/api/reading-list/${book.id}`)).status, 200);
    assert.equal((await a.api.get('/api/reading-list')).body.data.items.length, 0);

    // ---- Report an issue notifies administrators
    assert.equal((await anon.post(`/api/resources/${book.id}/report`, { message: 'broken link here' })).status, 401);
    assert.equal((await a.api.post(`/api/resources/${book.id}/report`, { message: 'short' })).status, 400);
    assert.equal((await a.api.post(`/api/resources/${book.id}/report`, { message: 'The details look out of date.' })).status, 201);
    assert.ok(await db.notification.findFirst({ where: { userId: admin.id, title: { startsWith: 'Issue reported' } } }));

    // ---- Submit a service request
    const it = (await anon.get('/api/resources?q=IT%20support')).body.data.resources.find((x) => x.acceptsRequests);
    assert.ok(it && it.formFields.length >= 2);
    const good = { resourceId: it.id, confirm: true, data: { issueType: 'Wi-Fi', description: 'Cannot connect in the library.' } };
    assert.equal((await anon.post('/api/service-requests', good)).status, 401);
    assert.equal((await a.api.post('/api/service-requests', { ...good, resourceId: book.id })).status, 400, 'resource does not accept requests');
    assert.equal((await a.api.post('/api/service-requests', { ...good, resourceId: U })).status, 404);
    r = await a.api.post('/api/service-requests', { resourceId: it.id, confirm: true, data: { issueType: 'Toaster', description: '' } });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.issueType && r.body.error.details.description);
    assert.equal((await a.api.post('/api/service-requests', { ...good, confirm: false })).status, 400, 'needs confirmation');
    r = await a.api.post('/api/service-requests', good);
    assert.equal(r.status, 201);
    const sr = r.body.data.request;
    assert.match(sr.referenceNo, /^SR-\d{4}-[A-Z0-9]{6}$/);
    assert.equal(sr.status, 'SUBMITTED');
    assert.ok(sr.dueAt);
    assert.ok(await db.notification.findFirst({ where: { userId: admin.id, title: { startsWith: 'New request' } } }), 'administrators are notified');
    assert.equal((await db.statusHistory.count({ where: { subjectId: sr.id } })), 1);
    await a.api.post('/api/service-requests', good); await a.api.post('/api/service-requests', good);
    assert.equal((await a.api.post('/api/service-requests', good)).status, 409, 'limit of 3 open requests per resource');

    // ---- Visibility
    assert.equal((await a.api.get('/api/service-requests/mine')).body.data.requests.length, 3);
    assert.equal((await b.api.get('/api/service-requests/mine')).body.data.requests.length, 0);
    assert.equal((await b.api.get(`/api/service-requests/${sr.id}`)).status, 404, "another student cannot read a request");
    assert.equal((await b.api.post(`/api/service-requests/${sr.id}/cancel`)).status, 404);
    assert.equal((await faculty.api.get(`/api/service-requests/${sr.id}`)).status, 404, 'unassigned faculty cannot read it');
    assert.equal((await admin.api.get(`/api/service-requests/${sr.id}`)).status, 200);
    assert.equal((await a.api.get('/api/manage/requests')).status, 403);
    assert.equal((await anon.get('/api/manage/requests')).status, 401);

    // ---- Assignment and the status engine
    r = await admin.api.get('/api/manage/requests?status=SUBMITTED');
    assert.ok(r.body.data.requests.some((x) => x.id === sr.id));
    assert.equal((await faculty.api.get('/api/manage/requests')).body.data.requests.length, 0, 'faculty only see assigned requests');
    assert.equal((await faculty.api.post(`/api/manage/requests/${sr.id}/assign`, { assigneeId: faculty.id })).status, 403, 'only administrators assign');
    assert.equal((await admin.api.post(`/api/manage/requests/${sr.id}/assign`, { assigneeId: a.id })).status, 400, 'students cannot be handlers');
    assert.equal((await admin.api.post(`/api/manage/requests/${sr.id}/assign`, { assigneeId: faculty.id })).status, 200);
    assert.equal((await faculty.api.get(`/api/manage/requests`)).body.data.requests.length, 1);
    assert.equal((await faculty2.api.post(`/api/manage/requests/${sr.id}/transition`, { to: 'UNDER_REVIEW' })).status, 404, 'other faculty cannot act');
    for (const to of ['APPROVED', 'REJECTED', 'INFO_REQUIRED', 'CANCELLED', 'NOPE']) assert.equal((await faculty.api.post(`/api/manage/requests/${sr.id}/transition`, { to, note: 'long enough note' })).status, 409, `SUBMITTED cannot jump to ${to}`);
    assert.equal((await faculty.api.post(`/api/manage/requests/${sr.id}/transition`, { to: 'UNDER_REVIEW' })).status, 200);
    assert.equal((await faculty.api.post(`/api/manage/requests/${sr.id}/transition`, { to: 'INFO_REQUIRED' })).status, 400, 'a note is required');
    assert.equal((await faculty.api.post(`/api/manage/requests/${sr.id}/transition`, { to: 'INFO_REQUIRED', note: 'Which building are you in?' })).status, 200);
    assert.ok(await db.notification.findFirst({ where: { userId: a.id, title: { contains: 'info required' } } }));
    assert.equal((await faculty.api.post(`/api/manage/requests/${sr.id}/transition`, { to: 'APPROVED' })).status, 409, 'must wait for the requester');

    // requester adds information
    assert.equal((await b.api.post(`/api/service-requests/${sr.id}/respond`, { message: 'Library 2nd floor' })).status, 404);
    assert.equal((await faculty.api.post(`/api/service-requests/${sr.id}/respond`, { message: 'Library 2nd floor' })).status, 403, 'only the requester can respond');
    assert.equal((await a.api.post(`/api/service-requests/${sr.id}/respond`, { message: '' })).status, 400);
    r = await a.api.post(`/api/service-requests/${sr.id}/respond`, { message: 'Library, second floor reading area.' });
    assert.equal(r.body.data.request.status, 'UNDER_REVIEW');
    assert.equal((await a.api.post(`/api/service-requests/${sr.id}/respond`, { message: 'again again' })).status, 409);

    // decisions
    assert.equal((await faculty.api.post(`/api/manage/requests/${sr.id}/transition`, { to: 'REJECTED', note: 'no' })).status, 400);
    r = await faculty.api.post(`/api/manage/requests/${sr.id}/transition`, { to: 'APPROVED', note: 'Fixed the access point.' });
    assert.equal(r.body.data.request.status, 'APPROVED');
    assert.equal(r.body.data.request.decisionNote, 'Fixed the access point.');
    assert.equal((await a.api.post(`/api/service-requests/${sr.id}/cancel`)).status, 409, 'decided requests cannot be cancelled');
    assert.equal((await faculty.api.post(`/api/manage/requests/${sr.id}/transition`, { to: 'REJECTED', note: 'changed my mind' })).status, 409, 'approved is terminal');
    r = await a.api.get(`/api/service-requests/${sr.id}`);
    assert.deepEqual(r.body.data.history.map((h) => h.toStatus), ['SUBMITTED', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED', 'UNDER_REVIEW', 'APPROVED']);
    assert.equal((await db.auditLog.count({ where: { entityId: sr.id } })) >= 2, true, 'assignment and decision are audited');

    // requester cancels a pending one; self-review is blocked even for administrators
    const second = (await a.api.get('/api/service-requests/mine?status=SUBMITTED')).body.data.requests[0];
    assert.equal((await a.api.post(`/api/service-requests/${second.id}/cancel`, { reason: 'Solved myself' })).body.data.request.status, 'CANCELLED');
    const adminReq = (await admin.api.post('/api/service-requests', good)).body.data.request;
    assert.equal((await admin.api.post(`/api/manage/requests/${adminReq.id}/transition`, { to: 'UNDER_REVIEW' })).status, 403, 'nobody reviews their own request');

    // overdue tracking
    const old = (await a.api.get('/api/service-requests/mine?status=SUBMITTED')).body.data.requests[0];
    await db.serviceRequest.update({ where: { id: old.id }, data: { dueAt: new Date(Date.now() - 86400000) } });
    r = await admin.api.get('/api/manage/requests?overdue=true');
    assert.ok(r.body.data.requests.some((x) => x.id === old.id && x.overdue === true));
    assert.ok(r.body.data.overdueCount >= 1);

    // unavailable resources and requests for unpublished ones
    const closed = await db.resource.create({ data: { kind: 'SERVICE', title: `${PREFIX} closed`, summary: 's', acceptsRequests: true, status: 'UNAVAILABLE', isDemo: false, formFields: [{ name: 'note', label: 'Note', type: 'text', required: false }] } });
    made.push(closed.id);
    assert.equal((await a.api.post('/api/service-requests', { resourceId: closed.id, confirm: true, data: {} })).status, 409);
    console.log('Resources and requests tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.resource.deleteMany({ where: { id: { in: made } } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
