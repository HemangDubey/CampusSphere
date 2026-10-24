const db = require('../db');

// Creates in-app notifications from real state changes. No email/SMS/push is sent (none is configured).
async function notify(userId, { type, title, body, link }, client = db) {
  if (!userId) return null;
  return client.notification.create({ data: { userId, type, title, body: body || null, link: link || null } });
}

async function notifyMany(userIds, payload, client = db) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await client.notification.createMany({ data: ids.map((userId) => ({ userId, type: payload.type, title: payload.title, body: payload.body || null, link: payload.link || null })) });
}

module.exports = { notify, notifyMany };
