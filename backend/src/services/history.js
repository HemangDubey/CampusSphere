const db = require('../db');

// Records one status change for a request, leave request or appointment.
async function recordStatus(subjectType, subjectId, actor, fromStatus, toStatus, note, client = db) {
  return client.statusHistory.create({
    data: { subjectType, subjectId, actorId: actor?.id || null, actorName: actor?.name || null, fromStatus: fromStatus || null, toStatus, note: note || null }
  });
}

const timeline = (subjectType, subjectId) => db.statusHistory.findMany({ where: { subjectType, subjectId }, orderBy: { createdAt: 'asc' } });

module.exports = { recordStatus, timeline };
