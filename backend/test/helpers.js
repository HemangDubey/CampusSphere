// Tiny HTTP client with a cookie jar for API tests against a real server and database.
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
    let json = null;
    try { json = await res.json(); } catch { /* not json */ }
    return { status: res.status, body: json, setCookie: set };
  }
  return { raw: (m, p) => call(m, p, undefined), get: (p, h) => call('GET', p, undefined, h), post: (p, b, h) => call('POST', p, b ?? {}, h), patch: (p, b) => call('PATCH', p, b), clear: () => { cookie = ''; } };
}

module.exports = { start, client };
