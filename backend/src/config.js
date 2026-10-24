// Central environment configuration. Loads backend/.env (never committed) once.
// Nothing secret is hardcoded; production refuses to start without a JWT secret.
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

function list(value) {
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

if (!process.env.DATABASE_URL) {
  if (isProduction) throw new Error('DATABASE_URL must be set in production.');
  console.warn('[config] DATABASE_URL is not set: database-backed features will fail until it is added to backend/.env.');
}

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  if (isProduction) throw new Error('JWT_SECRET must be set (32+ characters) in production.');
  // Development fallback: a random per-process secret, so sessions end when the server restarts.
  jwtSecret = crypto.randomBytes(48).toString('hex');
}

module.exports = {
  env,
  isProduction,
  port: Number(process.env.PORT) || 3000,
  frontendRoot: path.resolve(__dirname, '../../frontend'),
  // Origins allowed to call the API from a different origin. Same-origin requests need no CORS.
  corsOrigins: list(process.env.CORS_ORIGINS),
  jwtSecret,
  sessionDays: Number(process.env.SESSION_DAYS) || 7,
  // Cross-origin deployments (frontend and API on different sites) need COOKIE_SAMESITE=none (requires HTTPS).
  cookieSameSite: process.env.COOKIE_SAMESITE || 'lax',
  cookieSecure: isProduction,
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  // AI Assistant provider settings: server-side only, never sent to the browser.
  aiApiKey: process.env.GROQ_API_KEY || '',
  aiModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS) || 20000,
  aiRateLimitMax: Number(process.env.AI_RATE_LIMIT_MAX) || 20,
  resetTokenMinutes: 30
};
