process.env.AUTH_RATE_LIMIT_MAX = '4';
process.env.AI_RATE_LIMIT_MAX = '2';
const assert = require('assert');
const config = require('../src/config');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client } = require('./helpers');

const EMAIL = `test-${Date.now()}-rl@example.test`;

(async () => {
  const server = await start(createServer);
  const api = client(server);
  try {
    // Auth endpoints: 4 allowed per window, then 429 (1 attempt is spent on registration)
    assert.equal((await api.post('/api/auth/register', { name: 'Rate Limit', email: EMAIL, password: 'Sup3rSecret1', confirmPassword: 'Sup3rSecret1' })).status, 201);
    const codes = [];
    for (let i = 0; i < 5; i += 1) codes.push((await api.post('/api/auth/login', { email: 'rate@example.test', password: 'Whatever1' })).status);
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);

    // AI endpoint: per-user limit (no key configured, so allowed calls answer 503 without any upstream call)
    config.aiApiKey = '';
    // The auth limiter is per IP and already spent, so reuse the registered session cookie.
    const ai = [];
    for (let i = 0; i < 4; i += 1) ai.push((await api.post('/api/ai/chat', { message: 'hi' })).status);
    assert.deepEqual(ai, [503, 503, 429, 429]);
    console.log('Rate limit tests passed');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await db.user.deleteMany({ where: { email: EMAIL } });
    await db.$disconnect();
    server.close();
  }
})();
