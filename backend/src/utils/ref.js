const crypto = require('crypto');

// Human-friendly reference numbers like "SR-2026-7KQ2MX". Uniqueness is enforced by the database;
// callers retry on the rare collision (see withRef).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRef(prefix) {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${new Date().getFullYear()}-${code}`;
}

async function withRef(prefix, create, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    try { return await create(makeRef(prefix)); }
    catch (e) { if (!(e.code === 'P2002' && String(e.meta?.target || '').includes('referenceNo'))) throw e; }
  }
  throw new Error('Could not allocate a reference number');
}

module.exports = { makeRef, withRef };
