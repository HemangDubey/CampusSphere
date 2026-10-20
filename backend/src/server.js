// Zero-dependency server: serves frontend/ and the /api routes.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi } = require('./routes/api');
const MODULES = require('./modules');

const ROOT = path.resolve(__dirname, '../../frontend');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json'
};
const MODULE_SLUGS = new Set(MODULES.map((m) => m.slug));

function serveFile(res, file, status = 200) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);
    if (pathname === '/') return serveFile(res, path.join(ROOT, 'index.html'));
    const slug = pathname.replace(/^\/+|\/+$/g, '');
    if (MODULE_SLUGS.has(slug)) return serveFile(res, path.join(ROOT, 'pages', 'module.html'));
    let file;
    try { file = path.normalize(path.join(ROOT, decodeURIComponent(pathname))); } catch { file = ''; }
    if (!file.startsWith(ROOT + path.sep)) return serveFile(res, path.join(ROOT, 'pages', '404.html'), 404);
    fs.stat(file, (err, st) => {
      if (!err && st.isFile()) return serveFile(res, file);
      serveFile(res, path.join(ROOT, 'pages', '404.html'), 404);
    });
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => console.log(`CampusSphere running at http://localhost:${PORT}`));
}
module.exports = { createServer };
