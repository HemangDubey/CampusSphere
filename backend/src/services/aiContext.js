// Builds the "verified CampusSphere data" block that is appended to the assistant's instructions.
// Rules: only published, public information plus the SIGNED-IN user's own records; the minimum needed to answer
// questions; never other users' data; no contact details or personal fields beyond what the user already sees.
const db = require('../db');

const HOW_IT_WORKS = [
  'How CampusSphere works (accurate for this app):',
  '- Events: open an event, press Register, fill your details, review them and confirm. You get a reference number and can cancel under Events > My events until the event starts. An event can refuse registration if it is full, closed, cancelled or past.',
  '- Service requests: open a resource that accepts requests, fill its form, review and submit. Statuses: Submitted, Under review, Information required, Approved, Rejected, Cancelled. If staff ask for information, add it on the request page.',
  '- Leave requests: choose a reviewer, dates and a reason. Statuses: Submitted, Information required, Approved, Rejected, Withdrawn. Only the assigned reviewer or an administrator can decide, never the student.',
  '- Healthcare: demonstration only. Appointment requests are stored in the app and are not sent to a real clinic.',
  '- The AI Assistant cannot register you, submit forms or change anything. It can only explain and guide.'
].join('\n');

const fmt = (d) => new Date(d).toISOString().slice(0, 16).replace('T', ' ');

async function buildContext(user) {
  const [events, services, resources] = await Promise.all([
    db.event.findMany({ where: { status: 'PUBLISHED', startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' }, take: 6, include: { _count: { select: { registrations: { where: { status: 'REGISTERED' } } } } } }),
    db.resource.findMany({ where: { published: true, acceptsRequests: true }, select: { title: true, status: true }, take: 10 }),
    db.resource.findMany({ where: { published: true }, select: { title: true, kind: true, isDemo: true }, orderBy: { title: 'asc' }, take: 25 })
  ]);
  const lines = [HOW_IT_WORKS, '', 'Verified data from the CampusSphere database (entries marked [sample] are demonstration content, not official campus facts):'];
  lines.push('Upcoming published events:');
  lines.push(events.length ? events.map((e) => `- ${e.title} [${e.category}${e.isDemo ? ', sample' : ''}] on ${fmt(e.startsAt)} at ${e.venue}; ${e.capacity == null ? 'no seat limit' : `${Math.max(e.capacity - e._count.registrations, 0)} of ${e.capacity} seats left`}`).join('\n') : '- none right now');
  lines.push('Services that accept requests:');
  lines.push(services.length ? services.map((s) => `- ${s.title} (${s.status.toLowerCase()})`).join('\n') : '- none');
  lines.push('Directory entries (titles only):');
  lines.push(resources.map((r) => `- ${r.title} (${r.kind.toLowerCase()}${r.isDemo ? ', sample' : ''})`).join('\n'));

  if (user) {
    const [mineEvents, mineRequests, mineLeave] = await Promise.all([
      db.eventRegistration.findMany({ where: { userId: user.id, status: 'REGISTERED', event: { startsAt: { gt: new Date() } } }, include: { event: { select: { title: true, startsAt: true } } }, take: 5 }),
      db.serviceRequest.findMany({ where: { requesterId: user.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { referenceNo: true, status: true, resource: { select: { title: true } } } }),
      db.leaveRequest.findMany({ where: { studentId: user.id }, orderBy: { createdAt: 'desc' }, take: 5, select: { referenceNo: true, status: true, startDate: true, endDate: true } })
    ]);
    lines.push('', `The signed-in user is ${user.name.split(' ')[0]}. Their own records (share only if they ask about them):`);
    lines.push(`Registered upcoming events: ${mineEvents.length ? mineEvents.map((r) => `${r.event.title} on ${fmt(r.event.startsAt)}`).join('; ') : 'none'}`);
    lines.push(`Recent service requests: ${mineRequests.length ? mineRequests.map((r) => `${r.referenceNo} ${r.resource.title}: ${r.status}`).join('; ') : 'none'}`);
    lines.push(`Recent leave requests: ${mineLeave.length ? mineLeave.map((l) => `${l.referenceNo} ${l.startDate.toISOString().slice(0, 10)} to ${l.endDate.toISOString().slice(0, 10)}: ${l.status}`).join('; ') : 'none'}`);
  }
  return lines.join('\n');
}

module.exports = { buildContext };
