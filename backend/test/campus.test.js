// Integration tests for events, travel explorer and resources against the dev database.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client } = require('./helpers');

const PREFIX = `test-${Date.now()}`;
const PW = 'Sup3rSecret1';

async function signUp(server, n) {
  const api = client(server);
  const r = await api.post('/api/auth/register', { name: `Tester ${n}`, email: `${PREFIX}-${n}@example.test`, password: PW, confirmPassword: PW });
  assert.equal(r.status, 201);
  return { api, id: r.body.data.user.id };
}

(async () => {
  execFileSync('node', [path.join(__dirname, '../prisma/seed.js')], { stdio: 'ignore' }); // idempotent demo data
  const server = await start(createServer);
  const anon = client(server);
  let failed = false;
  let eventIds = [];
  try {
    const a = await signUp(server, 'a');
    const b = await signUp(server, 'b');

    // --- Events: listing, search, filters, validation
    let r = await anon.get('/api/events');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.total >= 5 && r.body.data.events[0].isDemo === true);
    r = await anon.get('/api/events?category=WORKSHOP');
    assert.ok(r.body.data.events.length >= 1 && r.body.data.events.every((e) => e.category === 'WORKSHOP'));
    r = await anon.get('/api/events?q=hackathon');
    assert.ok(r.body.data.events.some((e) => /hackathon/i.test(e.title)));
    r = await anon.get('/api/events?mode=ONLINE');
    assert.ok(r.body.data.events.every((e) => e.mode === 'ONLINE'));
    r = await anon.get('/api/events?q=zzzz-no-match');
    assert.equal(r.body.data.total, 0);
    assert.equal((await anon.get('/api/events?category=BOGUS')).status, 400);
    assert.equal((await anon.get('/api/events?page=0')).status, 400);
    assert.equal((await anon.get('/api/events?from=31-12-2026')).status, 400);
    assert.equal((await anon.get('/api/events/not-a-uuid')).status, 400);
    assert.equal((await anon.get('/api/events/11111111-1111-4111-8111-111111111111')).status, 404);

    // --- Registration rules on a 1-seat event and a past event
    const seat = await db.event.create({ data: { title: `${PREFIX} one seat`, description: 'test', category: 'WORKSHOP', startsAt: new Date(Date.now() + 864e5), venue: 'x', capacity: 1, isDemo: false } });
    const past = await db.event.create({ data: { title: `${PREFIX} past`, description: 'test', category: 'WORKSHOP', startsAt: new Date(Date.now() - 864e5), venue: 'x', isDemo: false } });
    eventIds = [seat.id, past.id];
    assert.equal((await anon.post(`/api/events/${seat.id}/register`)).status, 401);
    r = await a.api.post(`/api/events/${seat.id}/register`);
    assert.equal(r.status, 201);
    assert.equal(r.body.data.event.registered, true);
    assert.equal(r.body.data.event.spotsLeft, 0);
    assert.equal((await a.api.post(`/api/events/${seat.id}/register`)).body.error.code, 'ALREADY_REGISTERED');
    assert.equal((await b.api.post(`/api/events/${seat.id}/register`)).body.error.code, 'EVENT_FULL');
    assert.equal((await a.api.post(`/api/events/${past.id}/register`)).body.error.code, 'EVENT_PAST');
    // Ownership: B cannot cancel or see A's registration
    const delB = await fetchDelete(server, b.api, `/api/events/${seat.id}/register`);
    assert.equal(delB.status, 404);
    assert.equal(await db.eventRegistration.count({ where: { eventId: seat.id } }), 1);
    assert.equal((await b.api.get('/api/events/mine')).body.data.events.length, 0);
    assert.equal((await a.api.get('/api/events/mine')).body.data.events.length, 1);
    assert.equal((await anon.get('/api/events/mine')).status, 401);
    r = await a.api.get(`/api/events/${seat.id}`);
    assert.equal(r.body.data.event.registered, true);
    assert.equal((await b.api.get(`/api/events/${seat.id}`)).body.data.event.registered, false);

    // Cancel frees the seat
    assert.equal((await fetchDelete(server, a.api, `/api/events/${seat.id}/register`)).status, 200);
    assert.equal((await b.api.post(`/api/events/${seat.id}/register`)).status, 201);

    // Simultaneous requests for a fresh 1-seat event: exactly one succeeds
    const race = await db.event.create({ data: { title: `${PREFIX} race`, description: 'test', category: 'SPORTS', startsAt: new Date(Date.now() + 864e5), venue: 'x', capacity: 1, isDemo: false } });
    eventIds.push(race.id);
    const results = await Promise.all([a.api.post(`/api/events/${race.id}/register`), b.api.post(`/api/events/${race.id}/register`)]);
    assert.equal(results.filter((x) => x.status === 201).length, 1);
    assert.equal(await db.eventRegistration.count({ where: { eventId: race.id } }), 1);

    // --- Travel explorer
    r = await anon.get('/api/destinations');
    assert.ok(r.body.data.total >= 6 && r.body.data.destinations.every((d) => d.approximate === true));
    r = await anon.get('/api/destinations?type=HERITAGE');
    assert.ok(r.body.data.destinations.every((d) => d.type === 'HERITAGE') && r.body.data.destinations.length >= 2);
    r = await anon.get('/api/destinations?budget=BUDGET&q=vellore');
    assert.ok(r.body.data.destinations.length >= 1);
    assert.equal((await anon.get('/api/destinations?type=MOON')).status, 400);
    assert.equal((await anon.get('/api/destinations/does-not-exist')).status, 404);
    const dest = (await anon.get('/api/destinations/vellore-fort')).body.data.destination;
    assert.equal(dest.favorited, false);
    assert.equal((await anon.get('/api/destinations/favorites')).status, 401);
    assert.equal((await fetchPut(server, anon, `/api/destinations/${dest.id}/favorite`)).status, 401);
    assert.equal((await fetchPut(server, a.api, `/api/destinations/${dest.id}/favorite`)).status, 201);
    assert.equal((await fetchPut(server, a.api, `/api/destinations/${dest.id}/favorite`)).status, 201);
    assert.equal(await db.favoriteDestination.count({ where: { userId: a.id, destinationId: dest.id } }), 1, 'no duplicate favourites');
    assert.equal((await a.api.get('/api/destinations/vellore-fort')).body.data.destination.favorited, true);
    assert.equal((await a.api.get('/api/destinations/favorites')).body.data.destinations.length, 1);
    assert.equal((await b.api.get('/api/destinations/favorites')).body.data.destinations.length, 0, 'favourites are private');
    assert.equal((await fetchPut(server, a.api, '/api/destinations/11111111-1111-4111-8111-111111111111/favorite')).status, 404);
    assert.equal((await fetchDelete(server, b.api, `/api/destinations/${dest.id}/favorite`)).status, 200);
    assert.equal(await db.favoriteDestination.count({ where: { userId: a.id } }), 1, "B cannot remove A's favourite");
    assert.equal((await fetchDelete(server, a.api, `/api/destinations/${dest.id}/favorite`)).status, 200);

    // --- Resources
    r = await anon.get('/api/resources?kind=LIBRARY');
    assert.ok(r.body.data.resources.length >= 4 && r.body.data.resources.every((x) => x.kind === 'LIBRARY' && x.isDemo));
    assert.ok(r.body.data.categories.includes('Journals'));
    r = await anon.get('/api/resources?kind=LIBRARY&q=journal');
    assert.equal(r.body.data.resources.length, 1);
    r = await anon.get('/api/resources?q=zzzz-none');
    assert.equal(r.body.data.total, 0);
    assert.equal((await anon.get('/api/resources?kind=NOPE')).status, 400);
    assert.equal((await anon.get('/api/resources?pageSize=5000')).status, 400);
    const one = (await anon.get('/api/resources?kind=DEPARTMENT')).body.data.resources[0];
    assert.equal((await anon.get(`/api/resources/${one.id}`)).status, 200);
    console.log('Campus module tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.event.deleteMany({ where: { id: { in: eventIds } } });
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();

// The helper client only exposes GET/POST/PATCH; these send other verbs using the same cookie jar.
function jarRequest(server, api, method, p) { return api.raw(method, p); }
function fetchDelete(server, api, p) { return jarRequest(server, api, 'DELETE', p); }
function fetchPut(server, api, p) { return jarRequest(server, api, 'PUT', p); }
