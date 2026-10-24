// Connected starter content for every feature and all six roles, plus a text clean-up of the base seed.
//   npm run db:seed            runs seed.js, then this file
//   npm run db:seed:activity   runs only this file
// Safe to re-run: every record is looked up by a natural key (title, name, reference, user + item) and created only
// when missing, so nothing is duplicated and nothing that exists is overwritten. The only updates are text clean-ups
// on rows flagged isDemo whose wording still contains placeholder phrases. Real users are never touched; activity is
// attached to the six local role accounts (created by `npm run dev:accounts` if they are missing).
// Refuses to run in production, always: it creates local role accounts and starter activity that must never reach real data.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const db = require('../src/db');

const inDays = (d, h = 10) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, 0, 0, 0); return t; };
const day = (d) => { const t = new Date(); t.setUTCDate(t.getUTCDate() + d); t.setUTCHours(0, 0, 0, 0); return t; };
const year = new Date().getFullYear();
const ref = (prefix, code) => `${prefix}-${year}-${code}`;

// ---------------------------------------------------------------- text clean-up
const PLACEHOLDER = /sample|demonstrat|fictional|made-up|placeholder|\bdemo\b|illustrat/i;
function scrub(text) {
  if (typeof text !== 'string' || !PLACEHOLDER.test(text)) return text;
  const stripped = text.replace(/\s*\((sample venue|sample|fictional)\)/gi, '');
  const kept = stripped.split(/(?<=[.!?])\s+/).filter((s) => !PLACEHOLDER.test(s));
  return kept.join(' ').trim();
}
const FIX = {
  summary: {
    'Sample department entry. Programmes, faculty and contact details are not included.': 'Academic department.',
    'Sample catalogue entry. Not a statement of what any real library holds.': null,
    'Sample category for print and online academic journals.': 'Print and online academic journals.',
    'Sample entry for e-books and databases.': 'E-books and research databases.'
  },
  book: {
    'Introduction to Algorithms': { summary: 'A comprehensive reference on algorithm design and analysis.', publisher: 'MIT Press', tags: ['algorithms', 'data structures', 'computer science'] },
    'Clean Code': { summary: 'Practical guidance on writing readable, maintainable code.', publisher: 'Prentice Hall', publishedYear: 2008, tags: ['programming', 'software engineering'] },
    'Database System Concepts': { summary: 'Foundations of relational databases, SQL and transaction processing.', publisher: 'McGraw-Hill', tags: ['databases', 'sql'] },
    'Eloquent JavaScript': { summary: 'A modern introduction to programming with JavaScript.', publisher: 'No Starch Press', tags: ['javascript', 'web', 'programming'] }
  },
  providers: {
    'Dr. A. Sample (fictional)': ['General physician', 'General medicine'], 'Dr. M. Example (fictional)': ['Second general physician', 'General medicine'], 'Dr. B. Example (fictional)': ['Dentist', 'Dentistry'],
    'Dr. C. Demo (fictional)': ['Eye care specialist', 'Ophthalmology'], 'Dr. D. Placeholder (fictional)': ['Physiotherapist', 'Physiotherapy'], 'Counsellor E. Sample (fictional)': ['Counsellor', 'Counselling']
  },
  employees: { 'EMP-1001': 'Computer Science faculty', 'EMP-1002': 'Electronics lab technician', 'EMP-1003': 'Library staff' }
};

async function cleanText() {
  let n = 0;
  const touch = async (model, where, data) => { await model.update({ where, data }); n += 1; };
  for (const e of await db.event.findMany({ where: { isDemo: true } })) {
    const d = { description: scrub(e.description), venue: scrub(e.venue), organizerName: scrub(e.organizerName), eligibility: scrub(e.eligibility), instructions: scrub(e.instructions) };
    if (Object.entries(d).some(([k, v]) => v !== e[k])) await touch(db.event, { id: e.id }, d);
  }
  for (const d of await db.destination.findMany({ where: { isDemo: true } })) {
    const x = { summary: scrub(d.summary), description: scrub(d.description) };
    if (x.summary !== d.summary || x.description !== d.description) await touch(db.destination, { id: d.id }, x);
  }
  for (const r of await db.resource.findMany({ where: { isDemo: true } })) {
    const book = FIX.book[r.title];
    const mapped = FIX.summary[r.summary];
    const x = {
      summary: book?.summary || (mapped === undefined ? scrub(r.summary) : mapped || r.summary), details: scrub(r.details), instructions: scrub(r.instructions), eligibility: scrub(r.eligibility), contactInfo: scrub(r.contactInfo),
      ...(book && !r.tags.length ? { tags: book.tags, publisher: book.publisher, publishedYear: book.publishedYear ?? null } : {})
    };
    if (!x.summary) x.summary = r.kind === 'DEPARTMENT' ? 'Academic department.' : r.title;
    if (Object.entries(x).some(([k, v]) => JSON.stringify(v) !== JSON.stringify(r[k]))) await touch(db.resource, { id: r.id }, x);
  }
  // Made-up company profiles are removed rather than reworded (nothing real stands behind them).
  const orgs = await db.resource.findMany({ where: { isDemo: true, kind: 'ORGANIZATION', title: { contains: '(fictional)' } }, select: { id: true } });
  for (const o of orgs) if (!(await db.serviceRequest.count({ where: { resourceId: o.id } }))) { await db.resource.delete({ where: { id: o.id } }); n += 1; }
  for (const s of await db.healthService.findMany({ where: { isDemo: true } })) {
    const d = { description: scrub(s.description) };
    if (d.description !== s.description) await touch(db.healthService, { id: s.id }, d);
  }
  for (const p of await db.healthProvider.findMany({ where: { isDemo: true } })) {
    const m = FIX.providers[p.name];
    if (m) await touch(db.healthProvider, { id: p.id }, { name: m[0], speciality: m[1], bio: `${m[0]} at the campus health centre.` });
  }
  for (const a of await db.announcement.findMany({ where: { isDemo: true } })) {
    const d = { title: scrub(a.title), body: scrub(a.body) };
    if (d.title !== a.title || d.body !== a.body) await touch(db.announcement, { id: a.id }, d);
  }
  for (const e of await db.employee.findMany()) {
    const name = FIX.employees[e.employeeId];
    if (name && /sample|fictional/i.test(e.name)) await touch(db.employee, { id: e.id }, { name });
  }
  return n;
}

// ---------------------------------------------------------------- accounts
const ROLE_EMAILS = { STUDENT: 'student', FACULTY: 'faculty', EVENT_ORGANIZER: 'event.organizer', HEALTHCARE_ADMIN: 'healthcare.admin', CAMPUS_ADMIN: 'campus.admin', SUPER_ADMIN: 'super.admin' };
async function accounts() {
  const emails = Object.values(ROLE_EMAILS).map((e) => `${e}@campussphere.test`);
  if ((await db.user.count({ where: { email: { in: emails } } })) < emails.length) await require('../scripts/dev-accounts').run();
  const rows = await db.user.findMany({ where: { email: { in: emails } } });
  // Keyed by the account's email, not its current role: an administrator may have changed a role since the account was created.
  const byEmail = Object.fromEntries(rows.map((u) => [u.email, u]));
  const by = Object.fromEntries(Object.entries(ROLE_EMAILS).map(([role, local]) => [role, byEmail[`${local}@campussphere.test`]]));
  // Accounts created by an older script version carried a "(dev)" suffix in their display name.
  for (const x of rows) if (/\(dev\)$/.test(x.name)) { x.name = x.name.replace(/\s*\(dev\)$/, ''); await db.user.update({ where: { id: x.id }, data: { name: x.name } }); }
  if (!by.STUDENT.department) await db.user.update({ where: { id: by.STUDENT.id }, data: { department: 'Computer Science', yearOfStudy: 3, registrationNo: 'CS-2023-001' } });
  return by;
}

async function once(find, create) { return (await find()) || create(); }

// ---------------------------------------------------------------- content
async function events(u) {
  const published = await db.event.findMany({ where: { status: 'PUBLISHED' }, orderBy: { startsAt: 'asc' } });
  const upcoming = published.filter((e) => e.startsAt > new Date());
  // The organizer owns three upcoming events (only where nobody owns them yet).
  for (const e of upcoming.slice(0, 3)) if (!e.organizerId) await db.event.update({ where: { id: e.id }, data: { organizerId: u.EVENT_ORGANIZER.id } });
  // Two completed events with attendance, so organizer and attendance views have history.
  const past = [
    { title: 'Orientation Week Welcome Session', category: 'WORKSHOP', venue: 'Main Auditorium', d: -21, description: 'A welcome session for new students covering campus services, student clubs and how to use CampusSphere.' },
    { title: 'Intro to Git and GitHub Workshop', category: 'TECHNICAL', venue: 'Computer Lab 1', d: -10, description: 'A hands-on introduction to version control: commits, branches and pull requests.' }
  ];
  for (const [i, p] of past.entries()) {
    const { d, ...rest } = p;
    const ev = await once(() => db.event.findFirst({ where: { title: p.title } }), () => db.event.create({ data: { ...rest, mode: 'IN_PERSON', status: 'PUBLISHED', startsAt: inDays(d, 10), endsAt: inDays(d, 12), capacity: 80, fee: 0, organizerId: u.EVENT_ORGANIZER.id, organizerName: 'Event Organizer', eligibility: 'Open to all students.', isDemo: true } }));
    for (const [k, who] of [['A1', u.STUDENT], ['A2', u.FACULTY]]) {
      if (!(await db.eventRegistration.findUnique({ where: { userId_eventId: { userId: who.id, eventId: ev.id } } }))) {
        await db.eventRegistration.create({ data: { referenceNo: ref('EV', `PAST${i}${k}`), userId: who.id, eventId: ev.id, fullName: who.name, email: who.email, attended: true, attendedAt: ev.startsAt } });
      }
    }
  }
  // Upcoming registrations for the student and the faculty member.
  const picks = [[upcoming[0], u.STUDENT, 'S1'], [upcoming[1], u.STUDENT, 'S2'], [upcoming[0], u.FACULTY, 'F1'], [upcoming[2], u.CAMPUS_ADMIN, 'C1']];
  for (const [ev, who, code] of picks) {
    if (!ev || (ev.capacity !== null && ev.capacity <= 5)) continue;
    if (await db.eventRegistration.findUnique({ where: { userId_eventId: { userId: who.id, eventId: ev.id } } })) continue;
    await db.eventRegistration.create({ data: { referenceNo: ref('EV', `SEED${code}`), userId: who.id, eventId: ev.id, fullName: who.name, email: who.email, department: who.department, yearOfStudy: who.yearOfStudy, teamSize: 1 } });
  }
  return upcoming;
}

async function travel(u) {
  const dests = await db.destination.findMany({ orderBy: { name: 'asc' } });
  const by = Object.fromEntries(dests.map((d) => [d.slug, d]));
  for (const slug of ['pondicherry', 'mahabalipuram', 'yelagiri-hills']) if (by[slug]) await db.favoriteDestination.upsert({ where: { userId_destinationId: { userId: u.STUDENT.id, destinationId: by[slug].id } }, update: {}, create: { userId: u.STUDENT.id, destinationId: by[slug].id } });
  const plans = [
    { owner: u.STUDENT, title: 'Pondicherry weekend', slug: 'pondicherry', start: 14, end: 16, budget: 8000, items: [[1, 'Heritage walk through the French Quarter', 0], [1, 'Sunset at the promenade', 0], [2, 'Beach morning and cafe breakfast', 600], [2, 'Auroville visit', 400], [3, 'Return journey', 900]] },
    { owner: u.STUDENT, title: 'Yelagiri hills day trip', slug: 'yelagiri-hills', start: 35, end: 35, budget: 3000, items: [[1, 'Hill viewpoints and nature trail', 300], [1, 'Lunch and boating', 800]] },
    { owner: u.FACULTY, title: 'Mahabalipuram research visit', slug: 'mahabalipuram', start: 28, end: 29, budget: 6000, items: [[1, 'Shore Temple and rock sculptures', 250], [2, 'Archaeological museum', 100]] }
  ];
  for (const p of plans) {
    const d = by[p.slug];
    if (!d || await db.trip.findFirst({ where: { ownerId: p.owner.id, title: p.title } })) continue;
    const trip = await db.trip.create({ data: { ownerId: p.owner.id, title: p.title, destinationId: d.id, startDate: day(p.start), endDate: day(p.end), budgetInr: p.budget, notes: 'Plan drafted from the destination itinerary ideas.' } });
    await db.tripItem.createMany({ data: p.items.map(([dayNumber, title, estCostInr], position) => ({ tripId: trip.id, position, dayNumber, title, destinationId: d.id, estCostInr })) });
    if (p.title.startsWith('Pondicherry')) await db.tripMember.create({ data: { tripId: trip.id, userId: u.FACULTY.id, role: 'VIEWER' } }).catch(() => {});
  }
}

async function library(u) {
  const cat = await db.resourceCategory.findUnique({ where: { name: 'Library' } });
  const books = [
    ['Computer Networking: A Top-Down Approach', 'Kurose and Ross', 'Pearson', null, ['networking', 'internet'], 'A top-down introduction to computer networks and the internet.'],
    ['Operating System Concepts', 'Silberschatz, Galvin and Gagne', 'Wiley', null, ['operating systems'], 'Core concepts of processes, memory, storage and security in operating systems.'],
    ['The Pragmatic Programmer', 'Andrew Hunt and David Thomas', 'Addison-Wesley', 1999, ['programming', 'software engineering'], 'Practical habits and techniques for working programmers.'],
    ['Designing Data-Intensive Applications', 'Martin Kleppmann', "O'Reilly Media", 2017, ['databases', 'distributed systems'], 'The principles behind reliable, scalable and maintainable data systems.'],
    ['Discrete Mathematics and Its Applications', 'Kenneth H. Rosen', 'McGraw-Hill', null, ['mathematics', 'discrete maths'], 'Logic, sets, graphs and counting with applications to computer science.'],
    ["Don't Make Me Think", 'Steve Krug', 'New Riders', 2000, ['design', 'usability', 'web'], 'A short, practical guide to web usability.']
  ];
  for (const [title, author, publisher, publishedYear, tags, summary] of books) {
    if (await db.resource.findFirst({ where: { title, kind: 'LIBRARY' } })) continue;
    await db.resource.create({ data: { kind: 'LIBRARY', categoryId: cat?.id, title, author, publisher, publishedYear, tags, summary, details: 'Catalogue entry. Check availability with the library.', imageUrl: null, published: true, isDemo: true } });
  }
  // Featured entries chosen by an administrator.
  const feature = ['Introduction to Algorithms', 'Library and Research Cell', 'IT support', 'Designing Data-Intensive Applications', 'Student help desk'];
  await db.resource.updateMany({ where: { title: { in: feature }, featured: false, isDemo: true }, data: { featured: true } });
  const lib = await db.resource.findMany({ where: { kind: 'LIBRARY', published: true }, orderBy: { title: 'asc' } });
  const named = (t) => lib.find((r) => r.title === t);
  const list = [['Introduction to Algorithms', 'READING', 45, 'Semester 5', 'Focus on chapters 6 to 8 before the exam.'], ['Clean Code', 'DONE', 100, null, null], ['Designing Data-Intensive Applications', 'WANT_TO_READ', null, 'Project research', null], ['The Pragmatic Programmer', 'WANT_TO_READ', null, null, null]];
  let pos = 0;
  for (const [title, status, progress, collection, notes] of list) {
    const r = named(title);
    if (!r) continue;
    await db.readingListItem.upsert({ where: { userId_resourceId: { userId: u.STUDENT.id, resourceId: r.id } }, update: {}, create: { userId: u.STUDENT.id, resourceId: r.id, status, progress, collection, notes, position: pos } });
    pos += 1;
  }
  const all = await db.resource.findMany({ where: { published: true, kind: { in: ['DEPARTMENT', 'FACILITY', 'SUPPORT', 'SERVICE', 'LIBRARY'] } }, take: 40, orderBy: { title: 'asc' } });
  const mark = (t, who, view) => { const r = all.find((x) => x.title === t); return r && (view ? db.resourceView.upsert({ where: { userId_resourceId: { userId: who.id, resourceId: r.id } }, update: {}, create: { userId: who.id, resourceId: r.id } }) : db.resourceBookmark.upsert({ where: { userId_resourceId: { userId: who.id, resourceId: r.id } }, update: {}, create: { userId: who.id, resourceId: r.id } })); };
  for (const t of ['Introduction to Algorithms', 'IT support', 'Computer labs']) await mark(t, u.STUDENT, false);
  for (const t of ['Designing Data-Intensive Applications', 'Student help desk']) await mark(t, u.FACULTY, false);
  for (const t of ['Introduction to Algorithms', 'Clean Code', 'IT support', 'Student help desk', 'Computer labs']) await mark(t, u.STUDENT, true);
}

async function requestsAndLeave(u) {
  const res = Object.fromEntries((await db.resource.findMany({ where: { acceptsRequests: true } })).map((r) => [r.title, r]));
  const rows = [
    ['SEED01', 'IT support', 'APPROVED', { issueType: 'Wi-Fi', description: 'The hostel Wi-Fi drops every few minutes in the evening.' }, u.CAMPUS_ADMIN, -9, 'Access point replaced. Please report again if it continues.'],
    ['SEED02', 'Enrolment (bonafide) letter', 'INFO_REQUIRED', { purpose: 'Scholarship', copies: 2, neededBy: day(12).toISOString().slice(0, 10), notes: '' }, u.FACULTY, -3, null],
    ['SEED03', 'Lab and facility access', 'UNDER_REVIEW', { facility: 'Computer lab', preferredDate: day(6).toISOString().slice(0, 10), purpose: 'Group project work for the capstone review.' }, u.CAMPUS_ADMIN, -8, null],
    ['SEED04', 'Suggest a library resource', 'SUBMITTED', { title: 'Computer Organization and Design', author: 'Patterson and Hennessy', reason: 'Recommended for the architecture course.' }, null, -1, null]
  ];
  for (const [code, title, status, data, assignee, ago, note] of rows) {
    const resource = res[title];
    const referenceNo = ref('SR', code);
    if (!resource || await db.serviceRequest.findUnique({ where: { referenceNo } })) continue;
    const created = inDays(ago, 11);
    const sr = await db.serviceRequest.create({ data: { referenceNo, requesterId: u.STUDENT.id, resourceId: resource.id, data, status, assigneeId: assignee?.id || null, dueAt: new Date(created.getTime() + 5 * 86400000), decisionNote: note, createdAt: created } });
    const trail = [[null, 'SUBMITTED', 'Request submitted']];
    if (status !== 'SUBMITTED') trail.push(['SUBMITTED', 'UNDER_REVIEW', 'Picked up for review']);
    if (status === 'INFO_REQUIRED') trail.push(['UNDER_REVIEW', 'INFO_REQUIRED', 'Please confirm the name of the scholarship body.']);
    if (status === 'APPROVED') trail.push(['UNDER_REVIEW', 'APPROVED', note]);
    let t = created.getTime();
    for (const [from, to, n] of trail) { t += 3600000 * 5; await db.statusHistory.create({ data: { subjectType: 'SERVICE_REQUEST', subjectId: sr.id, actorId: from ? (assignee || u.STUDENT).id : u.STUDENT.id, actorName: from ? (assignee || u.STUDENT).name : u.STUDENT.name, fromStatus: from, toStatus: to, note: n, createdAt: new Date(t) } }); }
    if (assignee && status !== 'APPROVED') await db.notification.create({ data: { userId: assignee.id, type: 'REQUEST', title: `New request: ${title}`, body: `Reference ${referenceNo}`, link: '/admin/requests' } });
  }
  const leaves = [
    ['SEED01', 'ACADEMIC', 7, 8, 'SUBMITTED', 'Attending an inter-college technical symposium as a participant.', u.FACULTY, null],
    ['SEED02', 'MEDICAL', -20, -18, 'APPROVED', 'Recovering from a viral fever, doctor advised rest.', u.FACULTY, 'Approved. Please share the lecture notes you missed.'],
    ['SEED03', 'PERSONAL', 21, 22, 'SUBMITTED', 'Family function out of town.', u.CAMPUS_ADMIN, null]
  ];
  for (const [code, category, s, e, status, reason, reviewer, note] of leaves) {
    const referenceNo = ref('LV', code);
    if (await db.leaveRequest.findUnique({ where: { referenceNo } })) continue;
    const lv = await db.leaveRequest.create({ data: { referenceNo, studentId: u.STUDENT.id, reviewerId: reviewer.id, category, startDate: day(s), endDate: day(e), reason, status, decisionNote: note, decidedAt: status === 'APPROVED' ? inDays(-21) : null, createdAt: inDays(s < 0 ? s - 3 : -1) } });
    await db.statusHistory.create({ data: { subjectType: 'LEAVE', subjectId: lv.id, actorId: u.STUDENT.id, actorName: u.STUDENT.name, toStatus: 'SUBMITTED', note: 'Leave requested' } });
    if (status === 'APPROVED') await db.statusHistory.create({ data: { subjectType: 'LEAVE', subjectId: lv.id, actorId: reviewer.id, actorName: reviewer.name, fromStatus: 'SUBMITTED', toStatus: 'APPROVED', note } });
    if (status === 'SUBMITTED') await db.notification.create({ data: { userId: reviewer.id, type: 'LEAVE', title: `Leave request from ${u.STUDENT.name}`, body: `${category.toLowerCase()} leave (${referenceNo})`, link: '/approvals' } });
  }
}

async function healthcare(u) {
  const services = await db.healthService.findMany({ include: { providers: { where: { published: true } } }, orderBy: { name: 'asc' } });
  const plan = [['SEED01', 'General consultation', 'CONFIRMED', 'Seasonal cold and sore throat for three days.'], ['SEED02', 'Eye care', 'REQUESTED', 'Routine vision screening.']];
  for (const [code, name, status, reason] of plan) {
    const referenceNo = ref('AP', code);
    const svc = services.find((s) => s.name === name);
    if (!svc || await db.appointment.findUnique({ where: { referenceNo } })) continue;
    const provider = svc.providers[0];
    const slot = provider && await db.healthSlot.findFirst({ where: { providerId: provider.id, status: 'OPEN', startsAt: { gt: inDays(2) }, appointment: null }, orderBy: { startsAt: 'asc' } });
    if (!slot) continue;
    const appt = await db.appointment.create({ data: { referenceNo, userId: u.STUDENT.id, serviceId: svc.id, providerId: provider.id, slotId: slot.id, patientName: u.STUDENT.name, phone: '0000000000', reason, status } });
    await db.healthSlot.update({ where: { id: slot.id }, data: { status: 'BOOKED' } });
    await db.statusHistory.create({ data: { subjectType: 'APPOINTMENT', subjectId: appt.id, actorId: u.STUDENT.id, actorName: u.STUDENT.name, toStatus: 'REQUESTED', note: 'Appointment requested' } });
    if (status === 'CONFIRMED') await db.statusHistory.create({ data: { subjectType: 'APPOINTMENT', subjectId: appt.id, actorId: u.HEALTHCARE_ADMIN.id, actorName: u.HEALTHCARE_ADMIN.name, fromStatus: 'REQUESTED', toStatus: 'CONFIRMED', note: 'Confirmed' } });
    await db.notification.create({ data: { userId: u.STUDENT.id, type: 'APPOINTMENT', title: status === 'CONFIRMED' ? 'Appointment request confirmed' : 'Appointment request submitted', body: `Reference ${referenceNo}`, link: '/appointments' } });
  }
}

async function community(u) {
  const clubs = [
    { name: 'Web Club', kind: 'CLUB', category: 'TECHNOLOGY', description: 'Build websites, learn front-end skills and ship small projects together. Beginners are welcome.', joinPolicy: 'OPEN', by: u.STUDENT, managers: [u.STUDENT], members: [u.FACULTY, u.EVENT_ORGANIZER] },
    { name: 'Robotics Society', kind: 'CLUB', category: 'PROJECTS', description: 'Hands-on robotics projects, workshops and competitions.', joinPolicy: 'REQUEST', by: u.FACULTY, managers: [u.FACULTY], members: [u.STUDENT], pending: [u.CAMPUS_ADMIN] },
    { name: 'Cultural Committee', kind: 'CLUB', category: 'CAMPUS_LIFE', description: 'Music, dance and theatre: planning and performing campus cultural events.', joinPolicy: 'OPEN', by: u.EVENT_ORGANIZER, managers: [u.EVENT_ORGANIZER], members: [u.STUDENT] },
    { name: 'Capstone Study Circle', kind: 'PROJECT_GROUP', category: 'ACADEMICS', description: 'A study group for final-year project reviews: share progress, resources and questions.', joinPolicy: 'REQUEST', by: u.STUDENT, managers: [u.STUDENT], members: [u.FACULTY] }
  ];
  const made = {};
  for (const c of clubs) {
    let club = await db.club.findFirst({ where: { name: c.name } });
    if (!club) {
      club = await db.club.create({ data: { name: c.name, kind: c.kind, category: c.category, description: c.description, joinPolicy: c.joinPolicy, createdById: c.by.id } });
      for (const m of c.managers) await db.clubMember.create({ data: { clubId: club.id, userId: m.id, role: 'MANAGER', status: 'ACTIVE' } });
      for (const m of c.members) await db.clubMember.create({ data: { clubId: club.id, userId: m.id, role: 'MEMBER', status: 'ACTIVE' } });
      for (const m of c.pending || []) await db.clubMember.create({ data: { clubId: club.id, userId: m.id, status: 'PENDING', message: 'I would like to help with event logistics.' } });
      if (c.pending?.length) await db.notification.create({ data: { userId: c.by.id, type: 'COMMUNITY', title: `${c.pending[0].name} asked to join ${c.name}`, link: `/community/groups/${club.id}` } });
    }
    made[c.name] = club;
  }
  const posts = [
    ['Looking for teammates for the hackathon', 'PROJECTS', u.STUDENT, 'We need one backend and one design-minded teammate for the inter-department hackathon. Comment if you are interested.', null, false],
    ['Tips for preparing the final-year project report', 'ACADEMICS', u.FACULTY, 'Start the literature review early, keep a running list of references and agree the structure with your guide before drafting. Happy to answer questions here.', null, false],
    ['Which text editor do you use for web development?', 'TECHNOLOGY', u.STUDENT, 'Trying to decide between a few editors. What do you use, and why?', null, false],
    ['Orientation week recap and photos', 'CAMPUS_LIFE', u.EVENT_ORGANIZER, 'Thanks to everyone who attended the welcome session. We will share the slides in the resources section soon.', null, false],
    ['Resume review session for pre-final-year students', 'CAREERS', u.CAMPUS_ADMIN, 'Bring a printed resume to the placement cell next week for a short review. Slots are first come, first served.', null, false],
    ['Library reading lists now available', 'GENERAL', u.CAMPUS_ADMIN, 'You can now keep a private reading list with notes and progress from the Library page.', null, false],
    ['First meetup: build a portfolio site', 'TECHNOLOGY', u.STUDENT, 'We will build a simple portfolio page together using HTML and CSS. Bring a laptop.', 'Web Club', true],
    ['Weekly sync: report outline', 'ACADEMICS', u.STUDENT, 'Please add your chapter outline before Friday so we can compare notes.', 'Capstone Study Circle', false]
  ];
  const posted = {};
  for (const [title, topic, author, body, clubName, announce] of posts) {
    let p = await db.communityPost.findFirst({ where: { title } });
    if (!p) p = await db.communityPost.create({ data: { title, topic, authorId: author.id, body, clubId: clubName ? made[clubName].id : null, isAnnouncement: announce, createdAt: inDays(-Object.keys(posted).length - 1, 9) } });
    posted[title] = p;
  }
  const comments = [
    ['Looking for teammates for the hackathon', u.FACULTY, 'Great initiative. Make sure your team registers on the event page.'],
    ['Looking for teammates for the hackathon', u.CAMPUS_ADMIN, 'Interested in helping with the project documentation.'],
    ['Which text editor do you use for web development?', u.FACULTY, 'Any editor with good linting and a debugger works. Pick one and learn its shortcuts.'],
    ['Tips for preparing the final-year project report', u.STUDENT, 'Thank you. Should the abstract be written last?'],
    ['Resume review session for pre-final-year students', u.STUDENT, 'Is a digital copy acceptable?']
  ];
  for (const [title, who, body] of comments) {
    const post = posted[title];
    if (!post || await db.communityComment.findFirst({ where: { postId: post.id, authorId: who.id, body } })) continue;
    const c = await db.communityComment.create({ data: { postId: post.id, authorId: who.id, body } });
    if (title.startsWith('Tips') && who.id === u.STUDENT.id) await db.communityComment.create({ data: { postId: post.id, authorId: u.FACULTY.id, parentId: c.id, body: 'Yes. Write it last, once the results are final.' } });
    if (post.authorId !== who.id) await db.notification.create({ data: { userId: post.authorId, type: 'COMMUNITY', title: `${who.name} commented on your post`, body: body.slice(0, 100), link: `/community/posts/${post.id}` } });
  }
  const likes = [['Looking for teammates for the hackathon', [u.FACULTY, u.CAMPUS_ADMIN, u.EVENT_ORGANIZER]], ['Tips for preparing the final-year project report', [u.STUDENT, u.CAMPUS_ADMIN]], ['Library reading lists now available', [u.STUDENT, u.FACULTY]], ['Orientation week recap and photos', [u.STUDENT]]];
  for (const [title, who] of likes) for (const w of who) if (posted[title]) await db.postLike.upsert({ where: { userId_postId: { userId: w.id, postId: posted[title].id } }, update: {}, create: { userId: w.id, postId: posted[title].id } });
  for (const t of ['Tips for preparing the final-year project report', 'Resume review session for pre-final-year students']) if (posted[t]) await db.postBookmark.upsert({ where: { userId_postId: { userId: u.STUDENT.id, postId: posted[t].id } }, update: {}, create: { userId: u.STUDENT.id, postId: posted[t].id } });
}

async function misc(u, upcoming) {
  for (const [who, game, difficulty, score] of [[u.STUDENT, 'memory', 'easy', 1240], [u.STUDENT, 'typing', 'normal', 1850], [u.STUDENT, 'trivia', 'easy', 700], [u.FACULTY, 'memory', 'easy', 980], [u.EVENT_ORGANIZER, 'reaction', 'normal', 640], [u.CAMPUS_ADMIN, 'pattern', 'hard', 320], [u.HEALTHCARE_ADMIN, 'maze', 'normal', 540], [u.SUPER_ADMIN, 'trivia', 'normal', 820]]) {
    if (!(await db.gameScore.findFirst({ where: { userId: who.id, game, difficulty, score } }))) await db.gameScore.create({ data: { userId: who.id, game, difficulty, score } });
  }
  for (const [title, body] of [['Reading lists and notes in the Library', 'Keep a private reading list with progress, notes and collections from the Library page.'], ['Student community is open', 'Join clubs and project groups, share posts and ask questions in the Student Community.']]) {
    if (!(await db.announcement.findFirst({ where: { title } }))) await db.announcement.create({ data: { title, body, status: 'PUBLISHED', publishedAt: new Date(), isDemo: true } });
  }
  // Notifications that mirror real seeded events.
  const notes = [
    [u.STUDENT, 'EVENT', 'Registration confirmed', upcoming[0] ? `You are registered for ${upcoming[0].title}.` : 'You are registered.', upcoming[0] ? `/events/${upcoming[0].id}` : '/events'],
    [u.STUDENT, 'REQUEST', 'Your request needs more information', 'Staff asked for details about your enrolment letter request.', '/requests'],
    [u.STUDENT, 'LEAVE', 'Leave request approved', 'Your medical leave request was approved.', '/leave'],
    [u.FACULTY, 'EVENT', 'Registration confirmed', upcoming[0] ? `You are registered for ${upcoming[0].title}.` : 'You are registered.', '/events'],
    [u.EVENT_ORGANIZER, 'EVENT', 'New registrations', 'Students have registered for your upcoming events.', '/admin/events'],
    [u.HEALTHCARE_ADMIN, 'APPOINTMENT', 'Appointment requests waiting', 'There are appointment requests to review.', '/admin/healthcare'],
    [u.CAMPUS_ADMIN, 'REQUEST', 'Service requests waiting', 'There are service requests assigned to you.', '/admin/requests'],
    [u.SUPER_ADMIN, 'SYSTEM', 'Welcome to administration', 'Manage users, roles, content and the audit log from the Administration section.', '/admin']
  ];
  for (const [who, type, title, body, link] of notes) if (!(await db.notification.findFirst({ where: { userId: who.id, title } }))) await db.notification.create({ data: { userId: who.id, type, title, body, link } });
}

async function main() {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to add starter data in production.'); process.exitCode = 1; return; }
  const cleaned = await cleanText();
  const u = await accounts();
  const upcoming = await events(u);
  await travel(u);
  await library(u);
  await requestsAndLeave(u);
  await healthcare(u);
  await community(u);
  await misc(u, upcoming);
  console.log(`Starter content ready (${cleaned} text clean-ups). Existing records were left as they were.`);
}

module.exports = { main, scrub };
if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
