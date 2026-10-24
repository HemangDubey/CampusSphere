// Travel explorer: discovery, favourites, recently viewed, and the persistent trip planner with sharing and collaborators.
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
  let hidden;
  try {
    const a = await signUp(server, db, PREFIX, 'a');
    const b = await signUp(server, db, PREFIX, 'b');
    const c = await signUp(server, db, PREFIX, 'c');

    // ---- Discovery
    let r = await anon.get('/api/destinations');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.total >= 6 && r.body.data.destinations.every((d) => d.approximate === true && d.published));
    assert.ok((await anon.get('/api/destinations?type=HERITAGE')).body.data.destinations.every((d) => d.type === 'HERITAGE'));
    assert.ok((await anon.get('/api/destinations?budget=BUDGET&q=vellore')).body.data.destinations.length >= 1);
    assert.ok((await anon.get('/api/destinations?days=1')).body.data.destinations.every((d) => d.recommendedDays <= 1));
    assert.ok((await anon.get('/api/destinations?maxKm=100')).body.data.destinations.every((d) => d.distanceKm <= 100));
    const byBudget = (await anon.get('/api/destinations?sort=budget')).body.data.destinations.map((d) => d.budgetMinInr);
    assert.deepEqual(byBudget, [...byBudget].sort((x, y) => x - y), 'sorted by estimated budget');
    const byPop = (await anon.get('/api/destinations?sort=popularity')).body.data.destinations.map((d) => d.popularity);
    assert.deepEqual(byPop, [...byPop].sort((x, y) => y - x));
    assert.ok((await anon.get('/api/destinations?q=beach')).body.data.total >= 0);
    for (const bad of ['type=MOON', 'days=99', 'maxKm=0', 'sort=cheapest', 'page=-1']) assert.equal((await anon.get(`/api/destinations?${bad}`)).status, 400, bad);

    // ---- Detail, related, recently viewed
    r = await a.api.get('/api/destinations/vellore-fort');
    assert.equal(r.status, 200);
    const dest = r.body.data.destination;
    assert.ok(dest.activities.length && dest.tips.length && Array.isArray(dest.itineraryIdeas) && r.body.data.related.length >= 1);
    assert.equal((await anon.get('/api/destinations/does-not-exist')).status, 404);
    assert.equal((await anon.get('/api/destinations/recent')).status, 401);
    assert.equal((await a.api.get('/api/destinations/recent')).body.data.destinations[0].slug, 'vellore-fort');
    assert.equal((await b.api.get('/api/destinations/recent')).body.data.destinations.length, 0, 'recent views are private');

    // ---- Favourites
    assert.equal((await anon.get('/api/destinations/favorites')).status, 401);
    assert.equal((await anon.raw('PUT', `/api/destinations/${dest.id}/favorite`)).status, 401);
    assert.equal((await a.api.put(`/api/destinations/${dest.id}/favorite`)).status, 201);
    assert.equal((await a.api.put(`/api/destinations/${dest.id}/favorite`)).status, 201);
    assert.equal(await db.favoriteDestination.count({ where: { userId: a.id, destinationId: dest.id } }), 1, 'no duplicate favourites');
    assert.equal((await a.api.get('/api/destinations/vellore-fort')).body.data.destination.favorited, true);
    assert.equal((await b.api.get('/api/destinations/favorites')).body.data.destinations.length, 0, 'favourites are private');
    assert.equal((await a.api.put(`/api/destinations/${U}/favorite`)).status, 404);
    assert.equal((await b.api.del(`/api/destinations/${dest.id}/favorite`)).status, 200);
    assert.equal(await db.favoriteDestination.count({ where: { userId: a.id } }), 1, "b cannot remove a's favourite");
    hidden = await db.destination.create({ data: { slug: `${PREFIX}-hidden`, name: 'Hidden', region: 'x', type: 'CITY', budget: 'BUDGET', summary: 's', description: 'd', budgetMinInr: 1, budgetMaxInr: 2, recommendedDays: 1, published: false, isDemo: false } });
    assert.equal((await a.api.get(`/api/destinations/${hidden.slug}`)).status, 404, 'unpublished destinations are hidden');
    assert.equal((await a.api.put(`/api/destinations/${hidden.id}/favorite`)).status, 404);

    // ---- Trips: validation and CRUD
    assert.equal((await anon.get('/api/trips')).status, 401);
    r = await a.api.post('/api/trips', { title: 'x', startDate: '2026-02-30', endDate: '2026-01-01', budgetInr: -5, destinationId: U });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.title && r.body.error.details.budgetInr);
    assert.ok((await a.api.post('/api/trips', { title: 'Reverse dates', startDate: '2026-12-10', endDate: '2026-12-01' })).body.error.details.endDate);
    assert.ok((await a.api.post('/api/trips', { title: 'Too long', startDate: '2026-01-01', endDate: '2026-06-01' })).body.error.details.endDate);
    r = await a.api.post('/api/trips', { title: 'Hills weekend', destinationId: dest.id, startDate: '2026-12-05', endDate: '2026-12-07', budgetInr: 3000, notes: 'with friends' });
    assert.equal(r.status, 201);
    const trip = r.body.data.trip;
    assert.equal(trip.role, 'OWNER');
    assert.equal(trip.days, 3);
    assert.equal(trip.destination.slug, 'vellore-fort');

    // items: add, reorder, remove (replace-all), expenses
    const items = [{ title: 'Bus', dayNumber: 1, estCostInr: 400 }, { title: 'Stay', dayNumber: 1, estCostInr: 1500 }, { title: 'Fort entry', dayNumber: 2, estCostInr: 100, destinationId: dest.id }];
    r = await a.api.put(`/api/trips/${trip.id}/items`, { items });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.trip.items.map((i) => i.title), ['Bus', 'Stay', 'Fort entry']);
    assert.equal(r.body.data.trip.estimatedTotalInr, 2000);
    assert.equal(r.body.data.trip.remainingInr, 1000);
    r = await a.api.put(`/api/trips/${trip.id}/items`, { items: [items[2], items[0]] });
    assert.deepEqual(r.body.data.trip.items.map((i) => i.title), ['Fort entry', 'Bus'], 'reorder and remove persist');
    assert.equal(await db.tripItem.count({ where: { tripId: trip.id } }), 2);
    r = await a.api.put(`/api/trips/${trip.id}/items`, { items: [{ title: 'Big', estCostInr: 9000 }] });
    assert.equal(r.body.data.trip.overBudget, true);
    assert.equal((await a.api.put(`/api/trips/${trip.id}/items`, { items: [{ title: '', estCostInr: 1 }] })).status, 400);
    assert.equal((await a.api.put(`/api/trips/${trip.id}/items`, { items: [{ title: 'x', estCostInr: -1 }] })).status, 400);
    assert.equal((await a.api.put(`/api/trips/${trip.id}/items`, { items: 'nope' })).status, 400);
    assert.equal((await a.api.put(`/api/trips/${trip.id}/items`, { items: Array.from({ length: 61 }, () => ({ title: 't' })) })).status, 400);
    await a.api.put(`/api/trips/${trip.id}/items`, { items: items.slice(0, 2) });
    assert.equal((await a.api.get(`/api/trips/${trip.id}`)).body.data.trip.items.length, 2, 'reopened trip shows saved items');
    r = await a.api.put(`/api/trips/${trip.id}`, { title: 'Hills weekend v2', budgetInr: 5000 });
    assert.equal(r.body.data.trip.title, 'Hills weekend v2');

    // ---- Ownership: another user cannot see or change it
    assert.equal((await b.api.get(`/api/trips/${trip.id}`)).status, 404);
    assert.equal((await b.api.put(`/api/trips/${trip.id}`, { title: 'hijack' })).status, 404);
    assert.equal((await b.api.put(`/api/trips/${trip.id}/items`, { items: [] })).status, 404);
    assert.equal((await b.api.del(`/api/trips/${trip.id}`)).status, 404);
    assert.equal((await b.api.post(`/api/trips/${trip.id}/duplicate`)).status, 404);
    assert.equal((await b.api.post(`/api/trips/${trip.id}/share`, { enabled: true })).status, 404);
    assert.equal((await b.api.get('/api/trips')).body.data.trips.length, 0);
    assert.equal((await b.api.get('/api/trips/not-a-uuid')).status, 400);

    // ---- Collaboration
    assert.equal((await a.api.post(`/api/trips/${trip.id}/members`, { email: 'nobody-here@example.test' })).status, 404);
    assert.equal((await a.api.post(`/api/trips/${trip.id}/members`, { email: a.email })).status, 400, 'cannot invite yourself');
    assert.equal((await a.api.post(`/api/trips/${trip.id}/members`, { email: 'bad' })).status, 400);
    assert.equal((await a.api.post(`/api/trips/${trip.id}/members`, { email: b.email, role: 'EDITOR' })).status, 201);
    assert.equal((await a.api.post(`/api/trips/${trip.id}/members`, { email: c.email, role: 'VIEWER' })).status, 201);
    assert.ok(await db.notification.findFirst({ where: { userId: b.id, title: { contains: 'invited you' } } }));
    assert.equal((await b.api.put(`/api/trips/${trip.id}/items`, { items: [{ title: 'Added by editor', estCostInr: 50 }] })).status, 200, 'editor can edit');
    assert.equal((await b.api.put(`/api/trips/${trip.id}`, { title: 'Edited by b' })).status, 200);
    assert.equal((await b.api.del(`/api/trips/${trip.id}`)).status, 403, 'editor cannot delete');
    assert.equal((await b.api.post(`/api/trips/${trip.id}/share`, { enabled: true })).status, 403);
    assert.equal((await b.api.post(`/api/trips/${trip.id}/members`, { email: c.email })).status, 403);
    assert.equal((await c.api.get(`/api/trips/${trip.id}`)).status, 200, 'viewer can read');
    assert.equal((await c.api.put(`/api/trips/${trip.id}/items`, { items: [] })).status, 403, 'viewer cannot edit');
    assert.equal((await c.api.put(`/api/trips/${trip.id}`, { title: 'nope title' })).status, 403);
    assert.equal((await b.api.get('/api/trips')).body.data.trips.length, 1, 'members see the shared trip');
    const memberView = (await b.api.get(`/api/trips/${trip.id}`)).body.data.trip;
    assert.equal(memberView.role, 'EDITOR');
    assert.equal(memberView.members.every((m) => m.email === undefined), true, 'member emails are only visible to the owner');
    assert.equal((await c.api.del(`/api/trips/${trip.id}/members/${b.id}`)).status, 403, 'cannot remove someone else');
    assert.equal((await c.api.del(`/api/trips/${trip.id}/members/${c.id}`)).status, 200, 'members can leave');
    assert.equal((await c.api.get(`/api/trips/${trip.id}`)).status, 404);

    // ---- Share link (read-only, no emails), then disabled
    r = await a.api.post(`/api/trips/${trip.id}/share`, { enabled: true });
    const token = r.body.data.trip.shareToken;
    assert.ok(token && token.length >= 20);
    assert.equal((await a.api.post(`/api/trips/${trip.id}/share`, { enabled: 'yes' })).status, 400);
    r = await anon.get(`/api/trips/shared/${token}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.trip.readOnly, true);
    assert.equal(JSON.stringify(r.body).includes(b.email), false, 'no member emails in shared view');
    assert.equal(JSON.stringify(r.body).includes('shareToken'), false);
    assert.equal((await anon.get('/api/trips/shared/short')).status, 404);
    await a.api.post(`/api/trips/${trip.id}/share`, { enabled: false });
    assert.equal((await anon.get(`/api/trips/shared/${token}`)).status, 404, 'disabled links stop working');

    // ---- Duplicate, then delete with cascade
    r = await b.api.post(`/api/trips/${trip.id}/duplicate`);
    assert.equal(r.status, 201, 'a member can copy a trip into their own account');
    const copy = r.body.data.trip;
    assert.equal(copy.role, 'OWNER');
    assert.equal(copy.items.length, 1);
    assert.match(copy.title, /\(copy\)$/);
    assert.equal((await a.api.get(`/api/trips/${copy.id}`)).status, 404);
    assert.equal((await a.api.del(`/api/trips/${trip.id}`)).status, 200);
    assert.equal(await db.tripItem.count({ where: { tripId: trip.id } }), 0);
    assert.equal(await db.tripMember.count({ where: { tripId: trip.id } }), 0);
    assert.equal((await a.api.get(`/api/trips/${trip.id}`)).status, 404);
    console.log('Travel tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    if (hidden) await db.destination.deleteMany({ where: { id: hidden.id } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
