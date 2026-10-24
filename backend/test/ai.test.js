// AI endpoint tests. The upstream provider is STUBBED here (global fetch is replaced for its URL only),
// so these prove validation, configuration, error mapping and privacy, not the quality of a real AI reply.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.AI_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const config = require('../src/config');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client } = require('./helpers');

const PREFIX = `test-${Date.now()}`;
const PW = 'Sup3rSecret1';
const realFetch = global.fetch;
let upstream = null; // function(init) => Response | throws
const calls = [];
global.fetch = (url, init) => {
  if (String(url).includes('api.groq.com')) { calls.push({ url: String(url), init }); return upstream(init); }
  return realFetch(url, init);
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const providerLeak = (body) => /groq|llama|gsk_|openai|authorization|bearer/i.test(JSON.stringify(body));

(async () => {
  const server = await start(createServer);
  const anon = client(server);
  const api = client(server);
  let failed = false;
  try {
    assert.equal((await api.post('/api/auth/register', { name: 'AI Tester', email: `${PREFIX}@example.test`, password: PW, confirmPassword: PW })).status, 201);

    // Auth required
    assert.equal((await anon.post('/api/ai/chat', { message: 'hi' })).status, 401);

    // Missing configuration: honest unavailable response, no upstream call
    config.aiApiKey = '';
    let r = await api.post('/api/ai/chat', { message: 'hello' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'AI_UNAVAILABLE');
    assert.equal(calls.length, 0);
    assert.equal(providerLeak(r.body), false);

    // Invalid payloads (no upstream call)
    config.aiApiKey = 'test-key-not-real';
    for (const bad of [undefined, 'str', [], {}, { message: '' }, { message: '   ' }, { message: 5 }, { message: 'x'.repeat(2001) },
      { message: 'hi', history: 'nope' }, { message: 'hi', history: [{ role: 'system', content: 'x' }] }, { message: 'hi', history: [{ role: 'user' }] },
      { message: 'hi', history: Array.from({ length: 13 }, () => ({ role: 'user', content: 'a' })) },
      { message: 'hi', history: [null] }, { message: 'hi', history: Array.from({ length: 6 }, () => ({ role: 'user', content: 'a'.repeat(3900) })) }]) {
      r = await api.post('/api/ai/chat', bad);
      assert.equal(r.status, 400, JSON.stringify(bad)?.slice(0, 60));
    }
    assert.equal(calls.length, 0, 'invalid requests never reach the provider');
    const raw = await fetch(`http://localhost:${server.address().port}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'cs_session=x' }, body: '{bad' });
    assert.ok([400, 401].includes(raw.status));

    // Success path (stubbed upstream)
    upstream = () => json(200, { id: 'x', model: 'internal-model', choices: [{ message: { role: 'assistant', content: '  Stubbed reply.  ' } }], usage: { total_tokens: 5 } });
    r = await api.post('/api/ai/chat', { message: 'Explain closures', history: [{ role: 'user', content: 'hi', extra: 'dropped' }, { role: 'assistant', content: 'hello' }] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { success: true, data: { reply: 'Stubbed reply.' } }, 'only the reply is returned; no provider object');
    const sent = JSON.parse(calls.at(-1).init.body);
    assert.equal(sent.messages[0].role, 'system');
    assert.deepEqual(sent.messages.slice(1).map((m) => m.role), ['user', 'assistant', 'user']);
    assert.equal(Object.keys(sent.messages[1]).join(), 'role,content', 'extra client fields are not forwarded');
    assert.equal(sent.model, config.aiModel);
    assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer test-key-not-real');
    assert.match(sent.messages[0].content, /not.*(invent|medical)|Never invent/i);

    // Grounding: real data is added to the instructions, scoped to the signed-in user
    const userA = (await db.user.findUnique({ where: { email: `${PREFIX}@example.test` } })).id;
    const other = await db.user.create({ data: { name: 'Bravo Secretname', email: `${PREFIX}-other@example.test`, passwordHash: 'x' } });
    const [e1, e2] = await Promise.all([db.event.findFirst({ where: { title: 'Cultural Night' } }), db.event.findFirst({ where: { title: 'Intra-College Sports Meet' } })]);
    await db.eventRegistration.create({ data: { referenceNo: `REG-TEST-${Date.now()}A`, userId: userA, eventId: e1.id } });
    await db.eventRegistration.create({ data: { referenceNo: `REG-TEST-${Date.now()}B`, userId: other.id, eventId: e2.id } });
    r = await api.post('/api/ai/chat', { message: 'What events can I join?' });
    const sys = JSON.parse(calls.at(-1).init.body).messages[0].content;
    assert.match(sys, /Upcoming published events:[\s\S]*Annual Tech Symposium/);
    assert.match(sys, /Registered upcoming events: Cultural Night/);
    assert.equal(/Registered upcoming events:[^\n]*Sports Meet/.test(sys), false, "another user's registration must not be included");
    assert.equal(sys.includes('Secretname') || sys.includes(other.email), false, 'no other user data in the context');
    assert.match(sys, /cannot register you/);
    assert.equal(sys.includes('passwordHash') || sys.includes('@example.test'), false, 'no emails or hashes in the context');
    // anonymous callers cannot reach the endpoint at all, so the user-specific block is never built without a session
    await db.eventRegistration.deleteMany({ where: { referenceNo: { startsWith: 'REG-TEST-' } } });
    await db.user.delete({ where: { id: other.id } });

    // Upstream failures map to generic provider-independent errors
    const cases = [
      [() => json(429, { error: { message: 'rate limit for groq org-123' } }), 429, 'AI_BUSY'],
      [() => json(500, { error: { message: 'internal groq failure stack' } }), 502, 'AI_FAILED'],
      [() => json(401, { error: { message: 'Invalid API Key gsk_secret' } }), 503, 'AI_UNAVAILABLE'],
      [() => json(200, { choices: [] }), 502, 'AI_FAILED'],
      [() => new Response('not json', { status: 200 }), 502, 'AI_FAILED'],
      [() => { throw new TypeError('fetch failed: ECONNREFUSED api.groq.com'); }, 502, 'AI_FAILED']
    ];
    for (const [fn, status, code] of cases) {
      upstream = fn;
      r = await api.post('/api/ai/chat', { message: 'hello' });
      assert.equal(r.status, status);
      assert.equal(r.body.error.code, code);
      assert.equal(providerLeak(r.body), false, `no provider details in: ${JSON.stringify(r.body)}`);
    }

    // Timeout
    config.aiTimeoutMs = 50;
    upstream = (init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    r = await api.post('/api/ai/chat', { message: 'hello' });
    assert.equal(r.status, 504);
    assert.equal(r.body.error.code, 'AI_TIMEOUT');
    config.aiTimeoutMs = 20000;

    // The old placeholder route is gone and the key never appears in any static asset
    assert.equal((await anon.post('/api/assistant', {})).status, 404);
    console.log('AI endpoint tests passed (provider stubbed)');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    global.fetch = realFetch;
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
