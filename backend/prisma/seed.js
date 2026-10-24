// Base content: events, destinations, campus resources, library entries, healthcare services, announcements.
//   npm run db:seed                       adds anything that is missing (idempotent, safe to re-run, never deletes)
//   npm run db:seed -- --base-only        base content only (also the behaviour when NODE_ENV=production)
//   npm run db:seed -- --reset-demo       development only: removes seeded rows first. Refused in production.
// In production this script never creates user accounts, employee records or starter activity, and never deletes
// anything. Starter activity for local development lives in seed-activity.js. Every text field is checked before
// insert so placeholder wording can never reach the interface.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();
const inDays = (d, hour = 10) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(hour, 0, 0, 0); return t; };
// Photos already used by the landing page (verified reachable). Anything without a photo gets a generated cover in the UI.
const photo = (id, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
const IMG = {
  library: photo('photo-1481627834876-b7833e8f5570'), lab: photo('photo-1532094349884-543bc11b234d'), seminar: photo('photo-1523580494863-6f3031224c94'),
  study: photo('photo-1517245386807-bb43f82c33c4'), reading: photo('photo-1498243691581-b145c3f54a5a'), main: photo('photo-1562774053-701939374585'), convocation: photo('photo-1541339907198-e08756dedf3f')
};

const events = [
  { title: 'Inter-Department Hackathon', category: 'TECHNICAL', mode: 'IN_PERSON', venue: 'Innovation Lab', capacity: 120, d: 9, h: 9, len: 24, fee: 0, img: IMG.lab,
    organizerName: 'Student Technical Council', eligibility: 'Open to all enrolled students. Teams of up to 4.', instructions: 'Bring a laptop and charger. Problem statements are shared at the opening session.',
    schedule: '09:00 Opening and problem statements\n10:00 Build starts\n09:00 next day Final demos\n12:00 Results',
    description: 'A 24-hour build event where student teams prototype a campus-focused idea and present it to a panel.' },
  { title: 'Annual Tech Symposium', category: 'SYMPOSIUM', mode: 'HYBRID', venue: 'Main Auditorium', capacity: 300, d: 16, h: 10, len: 8, fee: 150, img: IMG.seminar,
    organizerName: 'Department of Computer Science', eligibility: 'Final-year and pre-final-year students may present; everyone may attend.', instructions: 'Choose a track when registering. Paper presenters upload an abstract after registration.',
    schedule: '10:00 Inaugural talk\n11:00 Paper presentations\n13:00 Lunch\n14:00 Project expo\n16:30 Prize distribution',
    description: 'Paper presentations, project expos and guest talks across engineering streams. Fees are not collected in CampusSphere.' },
  { title: 'Cultural Night', category: 'CULTURAL', mode: 'IN_PERSON', venue: 'Open Air Theatre', capacity: null, d: 22, h: 18, len: 4, fee: 0, img: null,
    organizerName: 'Cultural Committee', eligibility: 'Open to everyone on campus.', instructions: 'Gates open 30 minutes before the start. Seating is first come, first served.',
    schedule: '18:00 Opening act\n18:45 Student performances\n20:30 Closing act',
    description: 'An evening of music, dance and theatre performed by student clubs.' },
  { title: 'Intra-College Sports Meet', category: 'SPORTS', mode: 'IN_PERSON', venue: 'Main Ground', capacity: 200, d: 30, h: 8, len: 8, fee: 0, img: null,
    organizerName: 'Sports Council', eligibility: 'Students with a valid ID card. Medical fitness is your own responsibility.', instructions: 'Report to your event captain 30 minutes before your heat.',
    schedule: '08:00 March past\n09:00 Track events\n12:00 Field events\n15:00 Finals',
    description: 'Track, field and team events across departments.' },
  { title: 'Web Development Workshop', category: 'WORKSHOP', mode: 'ONLINE', venue: 'Online (link shared after registration)', capacity: 60, d: 5, h: 15, len: 3, fee: 0, img: IMG.study,
    organizerName: 'Web Club', eligibility: 'Beginners welcome. No prior experience required.', instructions: 'Install a code editor beforehand. The meeting link appears on your registration after you register.',
    schedule: '15:00 Semantic HTML\n15:45 CSS layout\n16:30 JavaScript events',
    description: 'Hands-on introduction to semantic HTML, CSS and JavaScript events.' },
  { title: 'Research Paper Writing Workshop', category: 'WORKSHOP', mode: 'IN_PERSON', venue: 'Seminar Hall 2', capacity: 40, d: 12, h: 14, len: 2, fee: 0, img: IMG.reading,
    organizerName: 'Library and Research Cell', eligibility: 'Postgraduate and final-year students.', instructions: 'Bring a draft or an idea.',
    schedule: '14:00 Structuring a paper\n15:00 Citing sources\n15:30 Q&A',
    description: 'Structuring, citing and presenting academic papers.' },
  { title: 'Student Innovation Symposium', category: 'SYMPOSIUM', mode: 'IN_PERSON', venue: 'Conference Hall', capacity: 150, d: 40, h: 10, len: 6, fee: 0, img: IMG.main,
    organizerName: 'Innovation Cell', eligibility: 'Final-year and mini-project teams.', instructions: 'Teams register once; the team lead fills the form.',
    schedule: '10:00 Welcome\n10:30 Project showcase\n13:00 Lunch\n14:00 Peer feedback',
    description: 'Showcase of final-year and mini projects with peer feedback.' },
  { title: 'Career Guidance Seminar', category: 'WORKSHOP', mode: 'HYBRID', venue: 'Seminar Hall 1', capacity: 100, d: 7, h: 11, len: 2, fee: 0, img: IMG.seminar,
    organizerName: 'Placement Cell', eligibility: 'Pre-final and final-year students.', instructions: 'Bring your questions. Slides are shared after the session.',
    schedule: '11:00 Talk\n12:00 Open questions',
    description: 'A general talk about planning your career, preparing a resume and interviews.' }
];

const destinations = [
  { slug: 'vellore-fort', name: 'Vellore Fort', region: 'Vellore, Tamil Nadu', type: 'HERITAGE', budget: 'BUDGET', min: 200, max: 800, days: 1, km: 5, pop: 40, best: 'October to February, early morning or late afternoon',
    summary: 'A historic fort with a wide moat, close to many Vellore campuses.',
    description: 'A well-known historic landmark in Vellore with ramparts, a moat and a museum on the grounds. A realistic half-day outing for students based in the city.',
    tips: ['Go early or late afternoon to avoid midday heat.', 'Check current entry timings and fees before you travel.', 'Wear comfortable shoes for uneven stone paths.'],
    activities: ['Walk the ramparts', 'Visit the museum', 'Photography at the moat'],
    ideas: [{ title: 'Half-day fort walk', items: [{ title: 'Auto or bus to the fort', cost: 80 }, { title: 'Entry and museum', cost: 100 }, { title: 'Lunch nearby', cost: 150 }] }] },
  { slug: 'sripuram-golden-temple', name: 'Sripuram Golden Temple', region: 'Vellore, Tamil Nadu', type: 'SPIRITUAL', budget: 'BUDGET', min: 300, max: 1000, days: 1, km: 10, pop: 35, best: 'Weekday mornings are usually calmer',
    summary: 'A well-known temple complex on the outskirts of Vellore.',
    description: 'A temple complex with landscaped grounds, popular as a day trip from Vellore. Visitor rules such as dress code and photography limits apply.',
    tips: ['Confirm visiting hours and dress code in advance.', 'Expect queues on weekends and festival days.', 'Carry only what you need; security checks are common.'],
    activities: ['Temple visit', 'Garden walk'],
    ideas: [{ title: 'Morning visit', items: [{ title: 'Cab share to the temple', cost: 250 }, { title: 'Meal after the visit', cost: 200 }] }] },
  { slug: 'yelagiri-hills', name: 'Yelagiri Hills', region: 'Tirupattur district, Tamil Nadu', type: 'NATURE', budget: 'MODERATE', min: 1500, max: 4500, days: 2, km: 90, pop: 55, best: 'Post-monsoon months for greener views',
    summary: 'A hill-station weekend within reach of Vellore.',
    description: 'A small hill station with viewpoints, a lake and trekking trails, commonly used for weekend trips from nearby cities.',
    tips: ['Book stays ahead on weekends and holidays.', 'Roads are winding; plan daylight travel.', 'Carry water and light rain cover.'],
    activities: ['Short treks', 'Boating at the lake', 'Viewpoint sunsets'],
    ideas: [{ title: 'Weekend escape', items: [{ title: 'Bus or shared cab', cost: 400 }, { title: 'Budget stay, 1 night', cost: 1200 }, { title: 'Meals and local travel', cost: 900 }] }] },
  { slug: 'mahabalipuram', name: 'Mahabalipuram', region: 'Chengalpattu district, Tamil Nadu', type: 'HERITAGE', budget: 'MODERATE', min: 2500, max: 6000, days: 2, km: 250, pop: 60, best: 'November to February',
    summary: 'Coastal town known for ancient rock-cut monuments and a beach.',
    description: 'A UNESCO-listed group of monuments beside the Bay of Bengal. Pair the monuments with an evening at the shore.',
    tips: ['Start with the monuments in the morning light.', 'Check ticket rules for each protected site.', 'Beach swimming can be unsafe; follow local warnings.'],
    activities: ['Shore Temple visit', 'Rock-cut caves', 'Evening at the beach'],
    ideas: [{ title: 'Two-day monuments and shore', items: [{ title: 'Travel from Chennai or Vellore', cost: 700 }, { title: 'Monument tickets', cost: 300 }, { title: 'Stay, 1 night', cost: 1500 }, { title: 'Food', cost: 800 }] }] },
  { slug: 'pondicherry', name: 'Pondicherry (Puducherry)', region: 'Puducherry', type: 'BEACH', budget: 'MODERATE', min: 3000, max: 8000, days: 3, km: 160, pop: 80, best: 'October to March',
    summary: 'A coastal town with a French-quarter street layout and seafront.',
    description: 'Known for its seafront promenade, cafes and a distinctive old-town grid. A popular long-weekend option for students in the region.',
    tips: ['Rent a bicycle or scooter for the old town if you have a valid licence.', 'Book accommodation early for holiday weekends.', 'Check local rules before planning night-time beach plans.'],
    activities: ['Promenade walk', 'Old-town cafes', 'Beach sunrise'],
    ideas: [{ title: 'Long weekend', items: [{ title: 'Bus, round trip', cost: 800 }, { title: 'Stay, 2 nights', cost: 3000 }, { title: 'Local transport', cost: 600 }, { title: 'Food and cafes', cost: 1800 }] }] },
  { slug: 'chennai-city-break', name: 'Chennai city break', region: 'Chennai, Tamil Nadu', type: 'CITY', budget: 'PREMIUM', min: 4000, max: 12000, days: 3, km: 140, pop: 70, best: 'November to February',
    summary: 'A big-city weekend: museums, markets, the Marina and food.',
    description: 'The state capital offers museums, beaches, markets and a wide food scene. Costs vary a lot with where you stay and how you travel.',
    tips: ['Use public transport or ride-hailing for traffic-heavy hours.', 'Plan one area per day to limit travel time.', 'Check museum closing days.'],
    activities: ['Museum visit', 'Marina beach evening', 'Food walk'],
    ideas: [{ title: 'Three-day city plan', items: [{ title: 'Train, round trip', cost: 500 }, { title: 'Stay, 2 nights', cost: 3600 }, { title: 'Local transport', cost: 700 }, { title: 'Museums and tickets', cost: 500 }, { title: 'Food', cost: 1500 }] }] }
];

const categories = ['Academics', 'Library', 'Student services', 'Campus facilities', 'Support', 'Clubs and societies', 'Links', 'Organisations'];

const F = {
  bonafide: [
    { name: 'purpose', label: 'Purpose of the letter', type: 'select', required: true, options: ['Bank account', 'Visa or travel', 'Scholarship', 'Internship', 'Other'] },
    { name: 'copies', label: 'Number of copies', type: 'number', required: true },
    { name: 'neededBy', label: 'Needed by', type: 'date', required: true },
    { name: 'notes', label: 'Anything else the office should know', type: 'textarea', required: false, maxLength: 500 }
  ],
  it: [
    { name: 'issueType', label: 'Type of issue', type: 'select', required: true, options: ['Wi-Fi', 'Student account', 'Lab computer', 'Software installation', 'Other'] },
    { name: 'description', label: 'Describe the problem', type: 'textarea', required: true, maxLength: 800 }
  ],
  lab: [
    { name: 'facility', label: 'Lab or facility', type: 'select', required: true, options: ['Computer lab', 'Electronics lab', 'Sports complex', 'Seminar room'] },
    { name: 'preferredDate', label: 'Preferred date', type: 'date', required: true },
    { name: 'purpose', label: 'Purpose', type: 'textarea', required: true, maxLength: 500 }
  ],
  suggest: [
    { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 150 },
    { name: 'author', label: 'Author', type: 'text', required: false, maxLength: 100 },
    { name: 'reason', label: 'Why should the library stock it?', type: 'textarea', required: true, maxLength: 500 }
  ]
};

const R = (kind, cat, title, summary, extra = {}) => ({ kind, cat, title, summary, ...extra });
const resources = [
  ...['Computer Science and Engineering', 'Electronics and Communication', 'Mechanical Engineering', 'Business Administration', 'Mathematics and Sciences']
    .map((t) => R('DEPARTMENT', 'Academics', t, 'Academic department.', { details: 'Programme, faculty and contact details have not been published here yet.', imageUrl: IMG.main, instructions: 'Use the official departmental website for programmes, faculty and timetables.' })),
  R('LIBRARY', 'Library', 'Introduction to Algorithms', 'A comprehensive reference on algorithm design and analysis.', { publisher: 'MIT Press', tags: ['algorithms', 'data structures', 'computer science'], author: 'Cormen, Leiserson, Rivest, Stein', imageUrl: IMG.library, details: 'A standard reference text on algorithms and data structures. Add it to your reading list to track it.' }),
  R('LIBRARY', 'Library', 'Clean Code', 'Practical guidance on writing readable, maintainable code.', { publisher: 'Prentice Hall', publishedYear: 2008, tags: ['programming', 'software engineering'], author: 'Robert C. Martin', imageUrl: IMG.study, details: 'A widely read book about writing readable, maintainable code.' }),
  R('LIBRARY', 'Library', 'Database System Concepts', 'Foundations of relational databases, SQL and transaction processing.', { publisher: 'McGraw-Hill', tags: ['databases', 'sql'], author: 'Silberschatz, Korth, Sudarshan', imageUrl: IMG.library, details: 'A common textbook for relational databases and SQL.' }),
  R('LIBRARY', 'Library', 'Eloquent JavaScript', 'A modern introduction to programming with JavaScript.', { publisher: 'No Starch Press', tags: ['javascript', 'web', 'programming'], author: 'Marijn Haverbeke', imageUrl: IMG.study, details: 'A guide to JavaScript, including events and the browser.' }),
  R('LIBRARY', 'Library', 'Journals and periodicals', 'Print and online academic journals.', { imageUrl: IMG.reading, details: 'Access rules depend on your institution.' }),
  R('LIBRARY', 'Library', 'Digital library portal', 'E-books and research databases.', { imageUrl: IMG.reading, details: 'No live catalogue is connected to this app.' }),
  R('LIBRARY', 'Student services', 'Suggest a library resource', 'Ask the library to consider adding a book or journal.', { acceptsRequests: true, formFields: F.suggest, instructions: 'Give the title and a short reason. Requests are reviewed by campus staff.', eligibility: 'Any enrolled student.', imageUrl: IMG.library }),
  R('SERVICE', 'Student services', 'Enrolment (bonafide) letter', 'Request an enrolment letter for banks, visas, scholarships or internships.', { acceptsRequests: true, formFields: F.bonafide, requiredDocuments: ['Student ID card (bring to collection)'], eligibility: 'Currently enrolled students.', instructions: 'Fill the form. You will receive a reference number and can track progress here. Collection details are given by the office when the request is approved.', status: 'AVAILABLE' }),
  R('SUPPORT', 'Support', 'IT support', 'Report Wi-Fi, account or lab computer problems.', { acceptsRequests: true, formFields: F.it, instructions: 'Describe the problem so the IT team can reproduce it.', eligibility: 'Students and staff.', status: 'AVAILABLE' }),
  R('FACILITY', 'Campus facilities', 'Lab and facility access', 'Request time in a lab, the sports complex or a seminar room.', { acceptsRequests: true, formFields: F.lab, imageUrl: IMG.lab, eligibility: 'Students with a faculty-approved purpose.', instructions: 'Requests are reviewed against availability. Opening hours are not published here.', status: 'LIMITED' }),
  R('FACILITY', 'Campus facilities', 'Computer labs', 'Programming and project labs.', { imageUrl: IMG.lab, details: 'Opening hours have not been published yet.' }),
  R('FACILITY', 'Campus facilities', 'Sports complex', 'Indoor and outdoor sports facilities.', { details: 'Opening hours have not been published yet.' }),
  R('FACILITY', 'Campus facilities', 'Cafeteria and food court', 'Campus dining.', { details: 'Menus and timings have not been published yet.' }),
  R('SUPPORT', 'Support', 'Student help desk', 'General student queries.', { details: 'No phone number or email is shown because none has been verified. An administrator can add the official contact in Resource Management.', contactInfo: null }),
  R('SUPPORT', 'Support', 'Counselling and wellbeing', 'Student wellbeing support.', { details: 'If you need urgent help, contact local emergency services or a trusted person. This app is not a crisis service.' }),
  R('SUPPORT', 'Support', 'Placement cell', 'Career guidance and recruitment.', { details: 'An administrator can add the official contact in Resource Management.' }),
  R('CLUB', 'Clubs and societies', 'Web Club', 'Build websites and learn front-end skills together.', { details: 'Meeting times have not been published yet.', instructions: 'Ask at the student activities office how to join.' }),
  R('CLUB', 'Clubs and societies', 'Robotics Society', 'Hands-on robotics projects and competitions.', { details: 'Ask the club for meeting times.', instructions: 'Ask at the student activities office how to join.' }),
  R('CLUB', 'Clubs and societies', 'Cultural Committee', 'Music, dance and theatre.', { details: 'Ask the club for meeting times.', instructions: 'Ask at the student activities office how to join.' }),
  R('LINK', 'Links', 'Official institution website', 'Always verify administrative information on your institution website.', { details: 'No URL is hard-coded because none has been verified for your institution.' }),
];

const healthServices = [
  { name: 'General consultation', category: 'Primary care', description: 'First-contact consultation for everyday health questions.', providers: [{ name: 'General physician', speciality: 'General medicine', bio: 'General physician at the campus health centre.' }, { name: 'Second general physician', speciality: 'General medicine', bio: 'Second general physician at the campus health centre.' }] },
  { name: 'Dental check-up', category: 'Dental', description: 'Routine dental check-up.', providers: [{ name: 'Dentist', speciality: 'Dentistry', bio: 'Dentist at the campus health centre.' }] },
  { name: 'Eye care', category: 'Vision', description: 'Vision screening.', providers: [{ name: 'Eye care specialist', speciality: 'Ophthalmology', bio: 'Eye care specialist at the campus health centre.' }] },
  { name: 'Physiotherapy', category: 'Rehabilitation', description: 'Sports and posture physiotherapy.', providers: [{ name: 'Physiotherapist', speciality: 'Physiotherapy', bio: 'Physiotherapist at the campus health centre.' }] },
  { name: 'Wellbeing counselling', category: 'Wellbeing', description: 'Talk to a counsellor about stress or study pressure. In a crisis, contact local emergency services.', providers: [{ name: 'Counsellor', speciality: 'Counselling', bio: 'Counsellor at the campus health centre.' }] }
];

const announcements = [
  { title: 'Welcome to CampusSphere', body: 'CampusSphere brings events, campus services, the library and the student community together. Confirm anything important with your institution.' },
  { title: 'Event registration tips', body: 'Open an event, press Register, review your details and confirm. You will receive a reference number and can cancel from Events > My events before the event starts.' }
];

const employees = [
  { employeeId: 'EMP-1001', name: 'Computer Science faculty', designation: 'Assistant Professor', department: 'Computer Science', email: 'employee1@campussphere.test', phone: null },
  { employeeId: 'EMP-1002', name: 'Electronics lab technician', designation: 'Lab Technician', department: 'Electronics', email: 'employee2@campussphere.test', phone: null },
  { employeeId: 'EMP-1003', name: 'Library staff', designation: 'Librarian', department: 'Library', email: 'employee3@campussphere.test', phone: null }
];

async function reset() {
  await db.event.deleteMany({ where: { isDemo: true } });
  await db.destination.deleteMany({ where: { isDemo: true } });
  await db.serviceRequest.deleteMany({ where: { resource: { isDemo: true } } });
  await db.resource.deleteMany({ where: { isDemo: true } });
  await db.appointment.deleteMany({ where: { OR: [{ service: { isDemo: true } }] } });
  await db.healthService.deleteMany({ where: { isDemo: true } });
  await db.announcement.deleteMany({ where: { isDemo: true } });
}

// Wording that must never reach the interface. Checked against every string in the data above before anything is written.
const PLACEHOLDER = /sample|fictional|demonstrat|made-up|placeholder|\bdemo\b|demo data|lorem|example\.(com|org|net|test)/i;
function assertClean(label, value, trail = label) {
  if (typeof value === 'string') { if (PLACEHOLDER.test(value)) throw new Error(`Seed text contains placeholder wording at ${trail}: "${value.slice(0, 60)}"`); return; }
  if (Array.isArray(value)) value.forEach((v, i) => assertClean(label, v, `${trail}[${i}]`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => assertClean(label, v, `${trail}.${k}`));
}
const isProduction = () => process.env.NODE_ENV === 'production';

async function main() {
  for (const [name, data] of Object.entries({ events, destinations, resources, healthServices, announcements })) assertClean(name, data);
  if (!isProduction()) assertClean('employees', employees);
  if (process.argv.includes('--reset-demo')) {
    if (isProduction()) throw new Error('--reset-demo deletes seeded rows and is refused when NODE_ENV=production.');
    await reset();
    console.log('Demo content cleared.');
  }

  for (const name of categories) await db.resourceCategory.upsert({ where: { name }, update: {}, create: { name } });
  const catId = Object.fromEntries((await db.resourceCategory.findMany()).map((c) => [c.name, c.id]));

  if (!(await db.event.count({ where: { isDemo: true } }))) {
    await db.event.createMany({
      data: events.map(({ d, h, len, img, ...e }) => ({
        ...e, status: 'PUBLISHED', isDemo: true, coverImage: img, startsAt: inDays(d, h), endsAt: new Date(inDays(d, h).getTime() + len * 3600000),
        registrationOpensAt: inDays(-1, 9), registrationClosesAt: inDays(d - 1, 18)
      }))
    });
  }

  for (const { min, max, days, km, pop, best, ideas, ...d } of destinations) {
    await db.destination.upsert({
      where: { slug: d.slug }, update: {},
      create: { ...d, budgetMinInr: min, budgetMaxInr: max, recommendedDays: days, distanceKm: km, popularity: pop, bestTime: best, itineraryIdeas: ideas, imageUrl: null, gallery: [], isDemo: true }
    });
  }

  if (!(await db.resource.count({ where: { isDemo: true } }))) {
    await db.resource.createMany({
      data: resources.map(({ cat, formFields, requiredDocuments, ...x }) => ({ ...x, categoryId: catId[cat], formFields: formFields || undefined, requiredDocuments: requiredDocuments || [], isDemo: true }))
    });
  }

  if (!(await db.healthService.count({ where: { isDemo: true } }))) {
    for (const { providers, ...s } of healthServices) {
      await db.healthService.create({ data: { ...s, isDemo: true, providers: { create: providers.map((p) => ({ ...p, isDemo: true })) } } });
    }
  }
  // Availability for the next two weeks (weekdays, 10:00 to 12:00, 30-minute slots). Re-running only adds missing slots.
  const providers = await db.healthProvider.findMany({ where: { isDemo: true } });
  const slots = [];
  for (const p of providers) {
    for (let d = 1; d <= 14; d += 1) {
      const day = inDays(d, 0);
      if ([0, 6].includes(day.getDay())) continue;
      for (let m = 0; m < 120; m += 30) {
        const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, m);
        slots.push({ providerId: p.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60000) });
      }
    }
  }
  await db.healthSlot.createMany({ data: slots, skipDuplicates: true });

  if (!(await db.announcement.count({ where: { isDemo: true } }))) {
    await db.announcement.createMany({ data: announcements.map((a) => ({ ...a, status: 'PUBLISHED', isDemo: true, publishedAt: new Date() })) });
  }
  // Staff records are administrative data: never invented in production.
  if (!isProduction()) for (const e of employees) await db.employee.upsert({ where: { employeeId: e.employeeId }, update: {}, create: { ...e, joinedOn: new Date('2022-07-01'), isDemo: true } });
  console.log('Base content ready.');
  if (isProduction()) console.log('Production: no accounts, employee records or starter activity were created.');
  else if (!process.argv.includes('--base-only')) await require('./seed-activity').main();
}

module.exports = { events, destinations, resources, healthServices, announcements, employees, assertClean, PLACEHOLDER };
if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
else db.$disconnect();
