// Resource discovery (featured, popular, recent, recently viewed, tags) and the personal library (notes, progress,
// collections, ordering, export) including privacy between users.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client, signUp } = require('./helpers');

const PREFIX = `test-${Date.now()}`;

(async () => {
  const server = await start(createServer);
  const anon = client(server);
  let failed = false;
  try {
    const a = await signUp(server, db, PREFIX, 'a');
    const b = await signUp(server, db, PREFIX, 'b');
    const admin = await signUp(server, db, PREFIX, 'admin', 'CAMPUS_ADMIN');
    const book = (o = {}) => ({ kind: 'LIBRARY', title: `${PREFIX} Algorithms`, summary: 'A catalogue entry.', status: 'AVAILABLE', author: 'A. Author', published: true, ...o });

    // ---- Admin-managed catalogue fields
    assert.equal((await a.api.post('/api/admin/resources', book())).status, 403, 'students cannot create catalogue entries');
    let r = await admin.api.post('/api/admin/resources', book({ accessUrl: 'http://insecure.example', publisher: 'Pub' }));
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.accessUrl, 'http access links are rejected');
    assert.equal((await admin.api.post('/api/admin/resources', book({ publishedYear: 12 }))).status, 400, 'bad year');
    r = await admin.api.post('/api/admin/resources', book({ featured: true, accessUrl: 'https://example.org/book', publisher: 'Example Press', publishedYear: 2020, tags: 'Graphs, sorting\ndata structures' }));
    assert.equal(r.status, 201);
    const b1 = r.body.data.resource;
    assert.deepEqual(b1.tags, ['graphs', 'sorting', 'data structures']);
    assert.equal(b1.featured, true);
    const b2 = (await admin.api.post('/api/admin/resources', book({ title: `${PREFIX} Databases`, author: `=HYPERLINK("x")`, tags: 'sql' }))).body.data.resource;
    const b3 = (await admin.api.post('/api/admin/resources', book({ title: `${PREFIX} Hidden draft`, published: false }))).body.data.resource;

    // ---- Search, filters, sort
    assert.equal((await anon.get(`/api/resources?kind=LIBRARY&q=${PREFIX}`)).body.data.total, 2, 'drafts are not listed');
    assert.equal((await anon.get(`/api/resources?kind=LIBRARY&q=Example Press`)).body.data.resources.some((x) => x.id === b1.id), true, 'publisher is searchable');
    assert.equal((await anon.get(`/api/resources?kind=LIBRARY&tag=sql`)).body.data.resources.some((x) => x.id === b2.id), true, 'tag filter');
    assert.equal((await anon.get(`/api/resources?kind=LIBRARY&q=${PREFIX}&featured=true`)).body.data.total, 1);
    assert.equal((await anon.get('/api/resources?sort=bogus')).status, 400);
    assert.equal((await anon.get(`/api/resources/${b3.id}`)).status, 404, 'unpublished entries are hidden');

    // ---- Popular uses real bookmark counts; featured and recent come from the data
    await a.api.put(`/api/resources/${b2.id}/bookmark`);
    await b.api.put(`/api/resources/${b2.id}/bookmark`);
    await a.api.put(`/api/resources/${b1.id}/bookmark`);
    const popular = (await anon.get(`/api/resources?kind=LIBRARY&q=${PREFIX}&sort=popular`)).body.data.resources;
    assert.equal(popular[0].id, b2.id, 'most saved first');
    let home = (await anon.get('/api/resources/home?kind=LIBRARY')).body.data;
    assert.ok(home.featured.some((x) => x.id === b1.id));
    assert.ok(home.popular.some((x) => x.id === b2.id));
    assert.ok(home.recent.length > 0);
    assert.deepEqual(home.recentlyViewed, [], 'anonymous users have no history');

    // ---- Recently viewed is per user
    assert.equal((await a.api.get(`/api/resources/${b1.id}`)).status, 200);
    assert.equal((await a.api.get(`/api/resources/${b2.id}`)).status, 200);
    home = (await a.api.get('/api/resources/home?kind=LIBRARY')).body.data;
    assert.deepEqual(home.recentlyViewed.map((x) => x.id).slice(0, 2), [b2.id, b1.id], 'most recently opened first');
    assert.deepEqual((await b.api.get('/api/resources/home?kind=LIBRARY')).body.data.recentlyViewed, [], 'history is private');

    // ---- Reading list: notes, progress, collections
    assert.equal((await anon.get('/api/reading-list')).status, 401);
    assert.equal((await anon.get('/api/reading-list/export.csv')).status, 401);
    assert.equal((await a.api.put(`/api/reading-list/${b1.id}`, { status: 'READING' })).status, 201);
    assert.equal((await a.api.put(`/api/reading-list/${b2.id}`, { status: 'WANT_TO_READ' })).status, 201);
    assert.equal((await a.api.patch(`/api/reading-list/${b1.id}`, { progress: 150 })).status, 400);
    assert.equal((await a.api.patch(`/api/reading-list/${b1.id}`, { progress: 'abc' })).status, 400);
    assert.equal((await a.api.patch(`/api/reading-list/${b1.id}`, { status: 'FINISHED' })).status, 400);
    r = await a.api.patch(`/api/reading-list/${b1.id}`, { progress: 40, notes: 'Chapter 3 is dense', collection: 'Semester 5' });
    assert.equal(r.status, 200);
    assert.equal((await b.api.patch(`/api/reading-list/${b1.id}`, { notes: 'hijack' })).status, 404, 'cannot edit someone else\'s entry');
    let items = (await a.api.get('/api/reading-list')).body.data.items;
    const mine = items.find((i) => i.resource.id === b1.id);
    assert.equal(mine.notes, 'Chapter 3 is dense');
    assert.equal(mine.progress, 40);
    assert.equal(mine.collection, 'Semester 5');
    assert.deepEqual((await b.api.get('/api/reading-list')).body.data.items, [], 'notes and lists are private');
    await a.api.patch(`/api/reading-list/${b1.id}`, { status: 'DONE' });
    items = (await a.api.get('/api/reading-list')).body.data.items;
    assert.equal(items.find((i) => i.resource.id === b1.id).progress, 100, 'finishing sets progress to 100');

    // ---- Ordering
    assert.equal((await a.api.put('/api/reading-list-order', { ids: [] })).status, 400);
    assert.equal((await a.api.put('/api/reading-list-order', { ids: [b1.id, b1.id] })).status, 400, 'duplicates rejected');
    assert.equal((await a.api.put('/api/reading-list-order', { ids: [b1.id, b3.id] })).status, 400, 'items not on your list rejected');
    assert.equal((await a.api.put('/api/reading-list-order', { ids: [b2.id, b1.id] })).status, 200);
    assert.deepEqual((await a.api.get('/api/reading-list')).body.data.items.map((i) => i.resource.id), [b2.id, b1.id], 'order persists');
    assert.equal((await a.api.put('/api/reading-list-order', { ids: [b1.id, b2.id] })).status, 200);
    assert.deepEqual((await a.api.get('/api/reading-list')).body.data.items.map((i) => i.resource.id), [b1.id, b2.id]);

    // ---- Export: own list only, formulas neutralised
    r = await a.api.get('/api/reading-list/export.csv');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/csv/);
    assert.match(r.text, /Chapter 3 is dense/);
    assert.match(r.text, /"'=HYPERLINK/, 'formula-like cells are prefixed');
    assert.equal((await b.api.get('/api/reading-list/export.csv')).text.includes('Chapter 3'), false, 'export is per user');

    // ---- Remove
    assert.equal((await a.api.del(`/api/reading-list/${b2.id}`)).status, 200);
    assert.equal((await a.api.get('/api/reading-list')).body.data.items.length, 1);
    console.log('Library tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.resource.deleteMany({ where: { title: { startsWith: PREFIX } } });
    await db.auditLog.deleteMany({ where: { summary: { contains: PREFIX } } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
