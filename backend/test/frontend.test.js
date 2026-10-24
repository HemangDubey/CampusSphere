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
  const { ROUTES: ROUTE_TABLE, match, APP_PAGES } = require('../src/pageRoutes');
  const REDIRECTS = new Set(['/services', '/labs']);
  const broken = [];
  const check = (file, ref) => {
    if (!ref || /^(https?:|mailto:|tel:|#|data:|javascript:)/.test(ref)) return;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) return;
    const normalised = clean.replace(/\$\{[^}]*\}/g, 'x').replace(/\/+$/, '') || '/';
    if (normalised === '/' || normalised === '/services' || normalised === '/labs' || match(normalised)) return;
    const target = clean.startsWith('/') ? path.join(root, clean) : path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(target)) broken.push(`${path.relative(root, file)} -> ${ref}`);
  };
  const jsFiles = [];
  (function walkJs(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, e.name); if (e.isDirectory()) walkJs(full); else if (e.name.endsWith('.js')) jsFiles.push(full); } })(path.join(root, 'js'));
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


  // ---- Every page route has its HTML file and its page script; generated shells point at real modules ----
  for (const p of ROUTE_TABLE) assert.ok(fs.existsSync(path.join(root, 'pages', p.file)), `route ${p.route} -> pages/${p.file} exists`);
  for (const p of APP_PAGES) {
    assert.ok(fs.existsSync(path.join(root, 'js/pages', `${p.js}.js`)), `js/pages/${p.js}.js exists`);
    assert.match(read(`pages/${p.file}`), new RegExp(`/js/pages/${p.js}\\.js`));
  }
  assert.equal(new Set(ROUTE_TABLE.map((p) => p.route)).size, ROUTE_TABLE.length, 'no duplicate route patterns');
  assert.equal(match('/trips/shared/abc123').file, 'trip-shared.html', 'specific routes win over /trips/:id');
  assert.equal(match('/trips/abc123').file, 'trip-editor.html');
  assert.equal(match('/events/xyz').file, 'event-detail.html');
  assert.equal(match('/admin/events').file, 'admin-events.html');
  assert.equal(match('/nothing/here/at/all'), undefined);

  // ---- Every ES module import resolves, and every named import is actually exported ----
  const exportsOf = (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').forEach((n) => { const x = n.trim().split(/\s+as\s+/).pop(); if (x) names.add(x); });
    if (/export\s+default/.test(src)) names.add('default');
    return names;
  };
  const badImports = [];
  for (const f of jsFiles) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/g)) {
      const [, clause, spec] = m;
      if (!spec.startsWith('.') && !spec.startsWith('/')) continue;
      const target = spec.startsWith('/') ? path.join(root, spec) : path.resolve(path.dirname(f), spec);
      if (!fs.existsSync(target)) { badImports.push(`${path.relative(root, f)} imports missing ${spec}`); continue; }
      const named = clause && /\{([^}]*)\}/.exec(clause);
      if (named) {
        const have = exportsOf(target);
        for (const n of named[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!have.has(n)) badImports.push(`${path.relative(root, f)} imports ${n} which ${spec} does not export`);
      }
    }
  }
  assert.deepEqual(badImports, [], badImports.join('; '));

  // ---- Lint: no unused named imports (a "void name;" placeholder does not count as a use) ----
  const unused = [];
  for (const f of jsFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const body = src.replace(/import\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]+['"];?/g, '').replace(/^\s*void\s+[^;]+;\s*$/gm, '');
    for (const m of src.matchAll(/import\s+\{([^}]*)\}\s+from\s+['"][^'"]+['"]/g)) {
      for (const raw of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        const local = raw.split(/\s+as\s+/).pop();
        if (!new RegExp(`(^|[^A-Za-z0-9_$.])${local.replace(/\$/g, '\\$')}(?![A-Za-z0-9_$])`).test(body)) unused.push(`${path.relative(root, f)}: ${local}`);
      }
    }
  }
  assert.deepEqual(unused, [], `unused imports:\n${unused.join('\n')}`);

  // ---- Reply rendering is safe and covers the markdown subset ----
  assert.equal(core.renderMarkdown('Hello **world**'), '<p>Hello <strong>world</strong></p>');
  assert.equal(core.renderMarkdown('- one\n- two'), '<ul><li>one</li><li>two</li></ul>');
  assert.equal(core.renderMarkdown('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(core.renderMarkdown('use `x < y`'), '<p>use <code>x &lt; y</code></p>');
  assert.equal(core.renderMarkdown('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(core.renderMarkdown('<img src=x onerror=alert(1)>').includes('<img'), false);
  assert.equal(core.renderMarkdown('[x](javascript:alert(1))').includes('<a'), false, 'no links are ever created');

  // ---- No page promises features the product does not have ----
  const claims = /Book lab benches|bench slots|seat booking|shuttle stops|Innovation Lab 2|open until 8pm/i;
  for (const f of ['index.html', 'js/content.js']) assert.doesNotMatch(read(f), claims, `${f} still advertises an unimplemented feature`);

  console.log('Frontend checks passed');
})().catch((e) => { console.error(e); process.exitCode = 1; });
