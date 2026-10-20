// JSON API. Future modules (auth, dashboard, events, labs, assistant, voice)
// add handlers here; AI provider details stay server-side only.
const MODULES = require('../modules');

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/health' && req.method === 'GET') {
    return send(res, 200, { status: 'ok', service: 'campussphere', time: new Date().toISOString() });
  }
  if (pathname === '/api/modules' && req.method === 'GET') {
    return send(res, 200, { modules: MODULES });
  }
  if (pathname === '/api/newsletter' && req.method === 'POST') {
    const { email } = await readBody(req);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Please enter a valid email.' });
    return send(res, 201, { message: 'You are on the list. Campus updates are on their way.' });
  }
  if (pathname === '/api/assistant' && req.method === 'POST') {
    // Placeholder until the AI Assistant module is connected.
    return send(res, 503, { error: 'AI Assistant is coming soon.' });
  }
  return send(res, 404, { error: 'Not found' });
}

module.exports = { handleApi };
