// Integration tests for authentication. Needs the dev database (DATABASE_URL) with migrations applied.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
const assert = require('assert');
const crypto = require('crypto');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start, client } = require('./helpers');

const PREFIX = `test-${Date.now()}`;
const email = (n) => `${PREFIX}-${n}@example.test`;
const PW = 'Sup3rSecret1';

(async () => {
  const server = await start(createServer);
  const api = client(server);
  let failed = false;
  try {
    // Registration validation
    let r = await api.post('/api/auth/register', { name: 'A', email: 'nope', password: 'short', confirmPassword: 'x' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.name && r.body.error.details.email && r.body.error.details.password);
    r = await api.post('/api/auth/register', { name: 'Test User', email: email(1), password: PW, confirmPassword: 'Different1' });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.details.confirmPassword);
    r = await api.post('/api/auth/register', 'not-an-object');
    assert.equal(r.status, 400);

    // Successful registration signs in, sets an HTTP-only cookie, and never leaks the hash
    r = await api.post('/api/auth/register', { name: 'Test User', email: email(1).toUpperCase(), password: PW, confirmPassword: PW });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.user.email, email(1));
    assert.equal(JSON.stringify(r.body).includes('passwordHash'), false);
    assert.ok(r.setCookie.some((c) => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)));
    const stored = await db.user.findUnique({ where: { email: email(1) } });
    assert.notEqual(stored.passwordHash, PW);
    assert.match(stored.passwordHash, /^\$2[aby]\$/);

    // Duplicate email
    r = await api.post('/api/auth/register', { name: 'Test User', email: email(1), password: PW, confirmPassword: PW });
    assert.equal(r.status, 409);

    // Session persistence + profile
    r = await api.get('/api/auth/me');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.user.name, 'Test User');
    r = await api.patch('/api/auth/me', { department: 'CSE', yearOfStudy: 9 });
    assert.equal(r.status, 400);
    r = await api.patch('/api/auth/me', { department: 'CSE', yearOfStudy: 2, role: 'ADMIN' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.user.department, 'CSE');
    assert.equal(r.body.data.user.role, 'STUDENT', 'role must not be user-editable');

    // Logout invalidates the session server-side, even if the old cookie is replayed
    const oldCookie = (await db.session.findFirst({ where: { userId: stored.id } })).id;
    r = await api.post('/api/auth/logout');
    assert.equal(r.status, 200);
    r = await api.get('/api/auth/me');
    assert.equal(r.status, 401);
    assert.equal((await db.session.findUnique({ where: { id: oldCookie } })).revokedAt !== null, true);

    // Protected route without auth, and with a forged cookie
    api.clear();
    assert.equal((await api.get('/api/auth/me')).status, 401);
    assert.equal((await api.get('/api/auth/me', { Cookie: 'cs_session=forged.token.value' })).status, 401);

    // Login: invalid input, wrong password and unknown email share one generic error
    assert.equal((await api.post('/api/auth/login', {})).status, 400);
    const wrong = await api.post('/api/auth/login', { email: email(1), password: 'Wrong-pass1' });
    const unknown = await api.post('/api/auth/login', { email: email(99), password: 'Wrong-pass1' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
    r = await api.post('/api/auth/login', { email: email(1), password: PW });
    assert.equal(r.status, 200);
    assert.equal((await api.get('/api/auth/me')).status, 200);

    // CSRF: cross-site Origin is rejected
    r = await api.post('/api/auth/logout', {}, { Origin: 'https://evil.example' });
    assert.equal(r.status, 403);

    // Password reset: generic response, single use, expiry, sessions revoked
    r = await api.post('/api/auth/forgot-password', { email: email(404) });
    const unknownMsg = r.body;
    assert.equal(r.status, 200);
    r = await api.post('/api/auth/forgot-password', { email: email(1) });
    assert.deepEqual(r.body, unknownMsg);
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await db.passwordResetToken.create({ data: { userId: stored.id, tokenHash: hash, expiresAt: new Date(Date.now() + 60000) } });
    r = await api.post('/api/auth/reset-password', { token, password: 'weak', confirmPassword: 'weak' });
    assert.equal(r.status, 400);
    r = await api.post('/api/auth/reset-password', { token, password: 'N3wPassword9', confirmPassword: 'N3wPassword9' });
    assert.equal(r.status, 200);
    assert.equal((await api.post('/api/auth/reset-password', { token, password: 'An0therPass1', confirmPassword: 'An0therPass1' })).status, 400, 'token is single use');
    assert.equal((await api.get('/api/auth/me')).status, 401, 'existing sessions revoked after reset');
    const expired = crypto.randomBytes(32).toString('hex');
    await db.passwordResetToken.create({ data: { userId: stored.id, tokenHash: crypto.createHash('sha256').update(expired).digest('hex'), expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await api.post('/api/auth/reset-password', { token: expired, password: 'N3wPassword9', confirmPassword: 'N3wPassword9' })).status, 400);
    assert.equal((await api.post('/api/auth/login', { email: email(1), password: PW })).status, 401);
    assert.equal((await api.post('/api/auth/login', { email: email(1), password: 'N3wPassword9' })).status, 200);

    // Malformed JSON
    const bad = await fetch(`http://localhost:${server.address().port}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    assert.equal(bad.status, 400);
    console.log('Auth tests passed');
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
