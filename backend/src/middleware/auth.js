const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const db = require('../db');
const { HttpError } = require('../utils/response');

const COOKIE = 'cs_session';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure || config.cookieSameSite === 'none',
    sameSite: config.cookieSameSite,
    path: '/',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000
  };
}

async function startSession(res, userId) {
  const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
  const session = await db.session.create({ data: { userId, expiresAt } });
  const token = jwt.sign({ sid: session.id }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(COOKIE, token, cookieOptions());
  return session;
}

function clearSessionCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE, opts);
}

// Resolves req.user and req.session from the cookie, checking the session row is live.
async function loadSession(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret); } catch { return null; }
  const session = await db.session.findUnique({ where: { id: payload.sid }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  return session;
}

async function requireAuth(req, res, next) {
  try {
    const session = await loadSession(req);
    if (!session) {
      clearSessionCookie(res);
      return next(new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
    }
    req.session = session;
    req.user = session.user;
    return next();
  } catch (e) { return next(e); }
}

// Like requireAuth but anonymous visitors pass through with req.user unset.
async function optionalAuth(req, res, next) {
  try {
    const session = await loadSession(req);
    if (session) { req.session = session; req.user = session.user; }
    next();
  } catch (e) { next(e); }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to do that.'));

// Rejects cross-site browser requests that carry an Origin we do not trust (CSRF defence for cookie auth).
function checkOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  let host;
  try { host = new URL(origin).host; } catch { return next(new HttpError(403, 'FORBIDDEN', 'Request origin not allowed.')); }
  if (host === req.get('host') || config.corsOrigins.includes(origin)) return next();
  return next(new HttpError(403, 'FORBIDDEN', 'Request origin not allowed.'));
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.'))
});

module.exports = { optionalAuth, requireAuth, requireRole, checkOrigin, authLimiter, startSession, clearSessionCookie, loadSession };
