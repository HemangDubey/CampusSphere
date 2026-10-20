const assert = require('assert');
const { createServer } = require('../src/server');

const server = createServer().listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const get = async (p) => { const r = await fetch(base + p); return { status: r.status, text: await r.text() }; };
  const post = (p, body) => fetch(base + p, { method: 'POST', body: JSON.stringify(body) });
  try {
    const home = await get('/');
    assert.equal(home.status, 200);
    assert.match(home.text, /CampusSphere/);
    assert.doesNotMatch(home.text, /groq/i);
    for (const p of ['/login', '/dashboard', '/services', '/events', '/labs', '/assistant', '/about', '/privacy']) {
      assert.equal((await get(p)).status, 200, p);
    }
    for (const p of ['/css/main.css', '/js/main.js', '/js/module.js']) assert.equal((await get(p)).status, 200, p);
    assert.equal((await get('/does-not-exist')).status, 404);
    assert.equal(JSON.parse((await get('/api/health')).text).status, 'ok');
    assert.equal((await post('/api/newsletter', { email: 'bad' })).status, 400);
    assert.equal((await post('/api/newsletter', { email: 'student@uni.edu' })).status, 201);
    console.log('All smoke tests passed');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
  server.close();
});
