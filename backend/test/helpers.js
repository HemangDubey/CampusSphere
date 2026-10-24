// Tiny HTTP client with a cookie jar for API tests against a real server and database.
const assert = require('assert');

function start(createServer) {
  return new Promise((resolve) => {
    const server = createServer().listen(0, () => resolve(server));
  });
}

function client(server) {
  const base = `http://localhost:${server.address().port}`;
  let cookie = '';
  async function call(method, path, body, extraHeaders = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const set = res.headers.getSetCookie?.() || [];
    set.forEach((c) => { const [pair] = c.split(';'); const [k, v] = pair.split('='); cookie = v ? `${k}=${v}` : ''; });
    const raw = await res.text();
    let json = null;
    try { json = JSON.parse(raw); } catch { /* not json (for example a CSV download) */ }
    return { status: res.status, body: json, text: raw, headers: res.headers, setCookie: set };
  }
  return {
    raw: (m, p, b) => call(m, p, b),
    get: (p, h) => call('GET', p, undefined, h),
    post: (p, b, h) => call('POST', p, b ?? {}, h),
    put: (p, b) => call('PUT', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b),
    del: (p) => call('DELETE', p),
    clear: () => { cookie = ''; }
  };
}

// Registers a user through the real API, optionally sets a staff role directly in the database
// (the only supported way to get a non-student role), and returns a signed-in client.
async function signUp(server, db, prefix, name, role = 'STUDENT') {
  const api = client(server);
  const email = `${prefix}-${name}@example.test`;
  const r = await api.post('/api/auth/register', { name: `Tester ${name}`, email, password: 'Sup3rSecret1', confirmPassword: 'Sup3rSecret1' });
  assert.equal(r.status, 201, `register ${name}`);
  const id = r.body.data.user.id;
  if (role !== 'STUDENT') await db.user.update({ where: { id }, data: { role } });
  return { api, id, email, name: `Tester ${name}` };
}

module.exports = { start, client, signUp };
