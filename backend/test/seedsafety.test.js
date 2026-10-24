// Production safety of the seed scripts and deployment files. None of these checks writes to a database:
// the production guards fire before any connection is used.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backend = path.resolve(__dirname, '..');
const seed = require('../prisma/seed');

const run = (script, args = [], env = {}) => spawnSync(process.execPath, [script, ...args], { cwd: backend, encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/none', ...env } });

try {
  // ---- Base content never contains placeholder wording (the same check also runs before every seed)
  for (const key of ['events', 'destinations', 'resources', 'healthServices', 'announcements', 'employees']) {
    assert.doesNotThrow(() => seed.assertClean(key, seed[key]), `${key} contains placeholder wording`);
  }
  assert.throws(() => seed.assertClean('x', [{ a: 'A Sample entry' }]), /placeholder wording/);
  assert.throws(() => seed.assertClean('x', { a: 'This is fictional' }), /placeholder wording/);
  assert.throws(() => seed.assertClean('x', { a: 'See https://example.com/a' }), /placeholder wording/);
  assert.ok(seed.events.length >= 8 && seed.resources.length >= 20 && seed.healthServices.length >= 4, 'base content is present');
  assert.equal(seed.resources.some((r) => r.kind === 'ORGANIZATION'), false, 'no invented organisations');
  assert.equal(seed.events.every((e) => !e.onlineLink || !/example\./.test(e.onlineLink)), true, 'no placeholder links');

  // ---- Production guards
  let r = run('prisma/seed.js', ['--reset-demo'], { NODE_ENV: 'production' });
  assert.notEqual(r.status, 0, '--reset-demo must be refused in production');
  assert.match(r.stderr, /refused when NODE_ENV=production/);
  r = run('prisma/seed-activity.js', [], { NODE_ENV: 'production' });
  assert.notEqual(r.status, 0, 'starter activity must be refused in production');
  assert.match(r.stderr, /Refusing to add starter data in production/);
  r = run('scripts/dev-accounts.js', [], { NODE_ENV: 'production' });
  assert.notEqual(r.status, 0, 'development accounts must be refused in production');
  assert.match(r.stderr, /Refusing to create development accounts in production/);

  // ---- The seed script's source never creates accounts, and the production path skips employees and activity
  const seedSource = fs.readFileSync(path.join(backend, 'prisma/seed.js'), 'utf8');
  assert.doesNotMatch(seedSource, /db\.user\.(create|upsert|update)/, 'seed.js must not create users');
  assert.match(seedSource, /if \(!isProduction\(\)\) for \(const e of employees\)/);
  assert.match(seedSource, /if \(isProduction\(\)\) console\.log/);
  assert.doesNotMatch(seedSource, /\bdeleteMany\b(?![\s\S]*async function main)/, 'deletions live only in the development reset helper');

  // ---- Deployment file
  const render = fs.readFileSync(path.join(backend, 'render.yaml'), 'utf8');
  assert.match(render, /rootDir: backend/);
  assert.match(render, /startCommand: npx prisma migrate deploy && node src\/server\.js/);
  assert.match(render, /healthCheckPath: \/api\/health/);
  assert.match(render, /key: DATABASE_URL\n\s+sync: false/, 'DATABASE_URL must not be stored in the file');
  assert.match(render, /key: JWT_SECRET\n\s+generateValue: true/, 'JWT_SECRET is generated, not stored');
  assert.doesNotMatch(render, /(postgres(ql)?:\/\/\S+:\S+@|gsk_|ghp_)/i, 'no credentials in render.yaml');
  const active = render.split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join(' ');
  assert.doesNotMatch(active, /migrate (dev|reset)|db:seed|--reset-demo|dev:accounts|admin:promote/, 'no reset, seed or account script in the deployed commands');
  const pkg = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies.prisma && pkg.dependencies['@prisma/client'], 'prisma must be a production dependency so migrate deploy works');
  assert.match(pkg.scripts.postinstall, /prisma generate/);
  console.log('Seed and deployment safety tests passed');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
