const db = require('../db');

const SENSITIVE = /password|token|secret|key|cookie/i;

// Append an audit record. Metadata is shallow-copied with sensitive-looking keys removed.
async function audit(actor, action, entityType, entityId, summary, metadata, client = db) {
  const safe = metadata && typeof metadata === 'object'
    ? Object.fromEntries(Object.entries(metadata).filter(([k]) => !SENSITIVE.test(k)))
    : undefined;
  return client.auditLog.create({ data: { actorId: actor?.id || null, action, entityType, entityId: entityId || null, summary, metadata: safe } });
}

module.exports = { audit };
