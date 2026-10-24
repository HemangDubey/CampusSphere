// Frontend checks that need no browser: AI Assistant helpers, link integrity, Bootstrap scoping.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '../../frontend');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

(async () => {
  // ---- AI Assistant pure helpers ----
  const g = globalThis;
  g.document = { querySelector: () => null }; // api.js reads a <meta> at import time
  const core = await import(pathToFileURL(path.join(root, 'js/assistant-core.js')).href);

  assert.deepEqual(core.splitBlocks('Hello\n```js\nconst a = 1;\n```\nBye'), [
    { type: 'text', content: 'Hello\n' }, { type: 'code', lang: 'js', content: 'const a = 1;' }, { type: 'text', content: '\nBye' }]);
  assert.deepEqual(core.splitBlocks('   '), []);
  assert.equal(core.splitBlocks('no code here').length, 1);
  assert.equal(core.speechText('Use this:\n```py\nprint(1)\n```\n**Done**'), 'Use this: Code example omitted. Done');

  const msgs = [];
  for (let i = 0; i < 20; i += 1) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: `m${i}`, id: i, extra: 'x' });
  msgs[18].error = true;
  msgs.push({ role: 'assistant', content: 'pending', pending: true });
  const h = core.boundHistory(msgs);
  assert.equal(h.length, 12, 'history is bounded');
  assert.ok(h.every((m) => Object.keys(m).join() === 'role,content'), 'only role and content are sent');
  assert.ok(!h.some((m) => m.content === 'm18' || m.content === 'pending'), 'failed/pending messages are excluded');
  assert.equal(h.at(-1).content, 'm19');

  for (const code of ['UNAUTHENTICATED', 'RATE_LIMITED', 'AI_BUSY', 'AI_TIMEOUT', 'NETWORK_ERROR', 'AI_UNAVAILABLE', 'AI_FAILED', undefined]) {
    const text = core.errorMessageFor({ code, message: 'provider said groq llama gsk_x' });
    assert.ok(text.length > 10);
    assert.doesNotMatch(text, /groq|llama|gsk_/i, `error text for ${code} must not echo upstream details`);
  }
  assert.equal(core.tooLong('x'.repeat(2000)), false);
  assert.equal(core.tooLong('x'.repeat(2001)), true);
  assert.deepEqual(Object.keys(core.LANGUAGES), ['en', 'hi', 'hinglish']);

  // ---- Assistant page contract ----
  const page = read('pages/assistant.html');
  assert.match(page, /<title>AI Assistant \| CampusSphere<\/title>/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /Shift\+Enter/);
  assert.doesNotMatch(page + read('js/assistant.js') + read('js/assistant-core.js') + read('js/api.js'), /groq|llama|gsk_|openai/i);
  assert.doesNotMatch(read('js/assistant.js'), /sk-|apiKey|API_KEY|Authorization/);

  // ---- Every local link/script/style in every page exists ----
  const pages = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'vendor') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full); else if (e.name.endsWith('.html')) pages.push(full);
    }
  })(root);
  const ROUTES = new Set(['/', '/login', '/register', '/forgot-password', '/reset-password', '/dashboard', '/events', '/travel', '/resources', '/services', '/healthcare', '/courses', '/checkout', '/employees', '/assistant', '/labs', '/labs/mouse', '/labs/keyboard', '/about', '/contact', '/privacy', '/terms']);
  const broken = [];
  const check = (file, ref) => {
    if (!ref || /^(https?:|mailto:|tel:|#|data:|javascript:)/.test(ref)) return;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) return;
    if (ROUTES.has(clean.replace(/\/+$/, '') || '/')) return;
    const target = clean.startsWith('/') ? path.join(root, clean) : path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(target)) broken.push(`${path.relative(root, file)} -> ${ref}`);
  };
  const jsFiles = fs.readdirSync(path.join(root, 'js')).map((f) => path.join(root, 'js', f));
  for (const f of pages) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) check(f, m[1]);
  }
  for (const f of jsFiles) {
    const js = fs.readFileSync(f, 'utf8');
    for (const m of js.matchAll(/href="(\/[^"#?]*)"/g)) check(f, m[1]); // links built in JS templates
  }
  assert.deepEqual(broken, [], `broken links: ${broken.join('; ')}`);

  // ---- Bootstrap: local files exist, only coursework pages use it, landing page does not ----
  const bsFiles = ['vendor/bootstrap-5.3.3/css/bootstrap.min.css', 'vendor/bootstrap-5.3.3/js/bootstrap.bundle.min.js', 'vendor/bootstrap-5.3.3/LICENSE'];
  bsFiles.forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), `${f} exists`));
  assert.match(fs.readFileSync(path.join(root, bsFiles[0]), 'utf8').slice(0, 200), /Bootstrap\s+v5\.3\.3/);
  const users = pages.filter((f) => /(href|src)="[^"]*vendor\/bootstrap[^"]*"/i.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f).replace(/\\/g, '/'));
  assert.deepEqual(users, ['pages/bootstrap-demo.html'], 'only the Bootstrap demo page loads Bootstrap');
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'pages/bootstrap-demo.html'), 'utf8'), /(cdn\.jsdelivr|unpkg|cdnjs|bootstrapcdn)/i, 'Bootstrap is local, not from a CDN');
  for (const f of ['index.html', 'css/main.css', 'css/components.css']) assert.doesNotMatch(read(f), /vendor\/bootstrap|bootstrap\.min|bootstrap\.bundle/i, `${f} must not load Bootstrap`);

  console.log('Frontend checks passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
