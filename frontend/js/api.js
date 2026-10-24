// Thin client for the CampusSphere backend. Every module talks to the API through request().
// The base URL comes from js/config.js (or an optional <meta name="api-base">); empty means same origin. No secrets ever live in the browser.
import { config } from './config.js';

const meta = document.querySelector('meta[name="api-base"]');
export const API_BASE = (config.apiBase || meta?.content || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function request(path, { method = 'GET', body, timeout = 15000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (signal) signal.addEventListener('abort', () => controller.abort());
  try {
    const res = await fetch(`${API_BASE}/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    let payload = null;
    try { payload = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok || payload?.success === false) {
      const err = payload?.error || {};
      throw new ApiError(err.message || `Request failed (${res.status}).`, { status: res.status, code: err.code || 'REQUEST_FAILED', details: err.details });
    }
    return payload?.data ?? null;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e.name === 'AbortError') throw new ApiError('The request timed out. Please try again.', { code: 'TIMEOUT' });
    throw new ApiError('Could not reach the server. Check your connection and try again.', { code: 'NETWORK_ERROR' });
  } finally {
    clearTimeout(timer);
  }
}

// AI Assistant. The contract is provider-independent: send a message plus optional bounded history,
// receive { reply }. The server holds all provider configuration; nothing about it reaches the browser.
export const AI_LIMITS = { maxMessage: 2000, maxHistory: 12 };
export const aiApi = {
  chat: ({ message, history = [] }) => request('/ai/chat', {
    method: 'POST',
    body: { message, history: history.slice(-AI_LIMITS.maxHistory).map(({ role, content }) => ({ role, content })) },
    timeout: 30000
  })
};

// Authentication calls. The server owns the session; the browser never stores tokens.
export const authApi = {
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  forgotPassword: (data) => request('/auth/forgot-password', { method: 'POST', body: data }),
  resetPassword: (data) => request('/auth/reset-password', { method: 'POST', body: data })
};
