const assert = require('assert');
const { createServer } = require('../src/server');

const server = createServer().listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const get = async (p) => { const r = await fetch(base + p); return { status: r.status, text: await r.text() }; };
  const post = (p, body, raw) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body) });
  try {
    const home = await get('/');
    assert.equal(home.status, 200);
    assert.match(home.text, /CampusSphere/);
    assert.doesNotMatch(home.text, /groq/i);
    const { APP_PAGES, OTHER_PAGES } = require('../src/pageRoutes');
    const samples = [...APP_PAGES, ...OTHER_PAGES].map((p) => p.route.replace(/:[a-zA-Z]+/g, 'sample'));
    for (const p of samples) assert.equal((await get(p)).status, 200, p);
    assert.equal((await fetch(base + '/services', { redirect: 'manual' })).status, 301);
    assert.equal((await fetch(base + '/labs', { redirect: 'manual' })).status, 301);
    assert.match((await get('/login')).text, /data-auth-page="login"/);
    for (const p of ['/css/main.css', '/css/auth.css', '/js/main.js', '/js/layout.js', '/js/config.js', '/js/auth.js', '/js/api.js']) assert.equal((await get(p)).status, 200, p);
    assert.equal((await get('/does-not-exist')).status, 404);
    assert.equal((await get('/labs/nope')).status, 404);

    const health = JSON.parse((await get('/api/health')).text);
    assert.equal(health.success, true);
    assert.equal(health.data.status, 'ok');

    assert.equal((await get('/api/modules')).status, 404, 'old modules endpoint is gone');
    const missing = await get('/api/nope');
    assert.equal(missing.status, 404);
    assert.equal(JSON.parse(missing.text).error.code, 'NOT_FOUND');

    const bad = await post('/api/newsletter', null, '{not json');
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code, 'INVALID_JSON');
    assert.equal((await post('/api/newsletter', { email: 'bad' })).status, 400);
    assert.equal((await post('/api/newsletter', { email: 'student@uni.edu' })).status, 201);

    assert.equal((await get('/dashboard')).status, 200);
    // Protected API without a session.
    const me = await get('/api/auth/me');
    assert.equal(me.status, 401);
    assert.equal(JSON.parse(me.text).error.code, 'UNAUTHENTICATED');
    console.log('All smoke tests passed');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
  server.close();
});
