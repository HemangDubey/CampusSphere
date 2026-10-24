// Security and configuration checks: headers, CORS, anonymous access, production config failure modes, syntax.
process.env.CORS_ORIGINS = 'https://app.example.test';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createServer } = require('../src/server');
const db = require('../src/db');
const { start } = require('./helpers');

const backend = path.resolve(__dirname, '..');
const UUID = '11111111-1111-4111-8111-111111111111';

(async () => {
  const server = await start(createServer);
  const base = `http://localhost:${server.address().port}`;
  let failed = false;
  try {
    // ---- Security headers on pages and API
    for (const p of ['/', '/login', '/api/health']) {
      const r = await fetch(base + p);
      const csp = r.headers.get('content-security-policy');
      assert.match(csp, /script-src 'self'/, p);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.ok(r.headers.get('referrer-policy'));
      assert.equal(r.headers.get('x-powered-by'), null, 'framework banner hidden');
    }
    assert.equal((await fetch(`${base}/api/health`)).headers.get('cache-control'), 'no-store');

    // ---- CSP is usable: no page under frontend/ has inline scripts or inline event handlers
    const offenders = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'vendor') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.html')) {
          const html = fs.readFileSync(full, 'utf8');
          if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html) || /\son(click|load|submit|error)=/i.test(html)) offenders.push(e.name);
        }
      }
    })(path.resolve(backend, '../frontend'));
    assert.deepEqual(offenders, [], `inline scripts/handlers would be blocked by the CSP: ${offenders}`);

    // ---- CORS: only the configured origin is allowed, and cross-site writes are refused
    let r = await fetch(`${base}/api/health`, { headers: { Origin: 'https://app.example.test' } });
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://app.example.test');
    assert.equal(r.headers.get('access-control-allow-credentials'), 'true');
    r = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{"email":"a@b.co","password":"x"}' });
    assert.equal(r.status, 403);
    r = await fetch(`${base}/api/auth/login`, { method: 'OPTIONS', headers: { Origin: 'https://app.example.test', 'Access-Control-Request-Method': 'POST' } });
    assert.ok(r.status < 300);

    // ---- Every private endpoint refuses anonymous callers
    const priv = [
      ['GET', '/api/auth/me'], ['PATCH', '/api/auth/me'], ['POST', '/api/auth/logout'],
      ['GET', '/api/events/mine'], ['POST', `/api/events/${UUID}/register`], ['DELETE', `/api/events/${UUID}/register`],
      ['GET', '/api/destinations/favorites'], ['PUT', `/api/destinations/${UUID}/favorite`], ['DELETE', `/api/destinations/${UUID}/favorite`],
      ['POST', '/api/healthcare/appointments'], ['GET', '/api/healthcare/appointments/mine'], ['DELETE', `/api/healthcare/appointments/${UUID}`],
      ['GET', '/api/employees'], ['POST', '/api/employees'], ['GET', `/api/employees/${UUID}`], ['PUT', `/api/employees/${UUID}`], ['DELETE', `/api/employees/${UUID}`],
      ['GET', '/api/courses/registrations/mine'], ['POST', '/api/courses/registrations'], ['DELETE', `/api/courses/registrations/${UUID}`],
      ['POST', '/api/ai/chat']
    ];
    for (const [method, p] of priv) {
      const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' });
      assert.equal(res.status, 401, `${method} ${p} must require sign-in`);
    }

    // ---- Error bodies never leak internals
    for (const p of ['/api/nope', '/api/events/not-a-uuid', '/api/events?page=-1']) {
      const text = await (await fetch(base + p)).text();
      assert.doesNotMatch(text, /stack|prisma|node_modules|\.js:\d+|postgres/i, p);
    }
    // No password hash field is ever part of a public record shape
    assert.doesNotMatch(await (await fetch(`${base}/api/events`)).text(), /passwordHash/);

    // ---- Production configuration fails fast and loudly
    const run = (env) => spawnSync(process.execPath, ['-e', "const c=require('./src/config');console.log(JSON.stringify({secure:c.cookieSecure,prod:c.isProduction}))"], { cwd: backend, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
    let out = run({ NODE_ENV: 'production', JWT_SECRET: 'short', DATABASE_URL: 'postgresql://x' });
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /JWT_SECRET/);
    out = run({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), DATABASE_URL: '' });
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /DATABASE_URL/);
    out = run({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgresql://x' });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(JSON.parse(out.stdout), { secure: true, prod: true }, 'production cookies are Secure');

    // ---- Syntax check of every JavaScript file (backend and frontend)
    const files = [];
    for (const dir of ['src', 'test', 'scripts', 'prisma']) {
      (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.js')) files.push(f); } })(path.join(backend, dir));
    }
    for (const f of fs.readdirSync(path.resolve(backend, '../frontend/js'))) if (f.endsWith('.js')) files.push(path.resolve(backend, '../frontend/js', f));
    for (const f of files) {
      const res = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
      assert.equal(res.status, 0, `syntax error in ${path.relative(backend, f)}: ${res.stderr}`);
    }
    console.log(`Security tests passed (${files.length} JS files syntax-checked)`);
  } catch (e) {
    failed = true;
    console.error(e);
  } finally {
    await db.$disconnect();
    server.close();
    if (failed) process.exitCode = 1;
  }
})();
