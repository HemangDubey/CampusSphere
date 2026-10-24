// Demonstration data only. Every record is flagged isDemo = true and shown as such in the UI.
// Replace with verified campus data by editing this file or inserting your own rows.
// Safe to re-run: it only adds records that are missing. Run with: npm run db:seed
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();
const inDays = (d, hour = 10) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(hour, 0, 0, 0); return t; };

const events = [
  { title: 'Inter-Department Hackathon', category: 'TECHNICAL', mode: 'IN_PERSON', venue: 'Innovation Lab (sample venue)', capacity: 120, d: 9, h: 9,
    description: 'A 24-hour build event where student teams prototype a campus-focused idea. Sample listing for demonstration.' },
  { title: 'Annual Tech Symposium', category: 'SYMPOSIUM', mode: 'HYBRID', venue: 'Main Auditorium (sample venue)', capacity: 300, d: 16, h: 10,
    description: 'Paper presentations, project expos and guest talks across engineering streams. Sample listing for demonstration.' },
  { title: 'Cultural Night', category: 'CULTURAL', mode: 'IN_PERSON', venue: 'Open Air Theatre (sample venue)', capacity: null, d: 22, h: 18,
    description: 'An evening of music, dance and theatre performed by student clubs. Sample listing for demonstration.' },
  { title: 'Intra-College Sports Meet', category: 'SPORTS', mode: 'IN_PERSON', venue: 'Main Ground (sample venue)', capacity: 200, d: 30, h: 8,
    description: 'Track, field and team events across departments. Sample listing for demonstration.' },
  { title: 'Web Development Workshop', category: 'WORKSHOP', mode: 'ONLINE', venue: 'Online (link shared after registration)', capacity: 60, d: 5, h: 15,
    description: 'Hands-on introduction to semantic HTML, CSS and JavaScript events. Sample listing for demonstration.' },
  { title: 'Research Paper Writing Workshop', category: 'WORKSHOP', mode: 'IN_PERSON', venue: 'Seminar Hall 2 (sample venue)', capacity: 2, d: 12, h: 14,
    description: 'Structuring, citing and presenting academic papers. Deliberately small capacity to demonstrate a full event. Sample listing.' },
  { title: 'Student Innovation Symposium', category: 'SYMPOSIUM', mode: 'IN_PERSON', venue: 'Conference Hall (sample venue)', capacity: 150, d: 40, h: 10,
    description: 'Showcase of final-year and mini projects with peer feedback. Sample listing for demonstration.' }
];

const destinations = [
  { slug: 'vellore-fort', name: 'Vellore Fort', region: 'Vellore, Tamil Nadu', type: 'HERITAGE', budget: 'BUDGET', min: 200, max: 800, days: 1,
    summary: 'A historic fort with a wide moat, close to many Vellore campuses.',
    description: 'A well-known historic landmark in Vellore with ramparts, a moat and a museum on the grounds. A realistic half-day outing for students based in the city.',
    tips: ['Go early or late afternoon to avoid midday heat.', 'Check current entry timings and fees before you travel.', 'Wear comfortable shoes for uneven stone paths.'] },
  { slug: 'sripuram-golden-temple', name: 'Sripuram Golden Temple', region: 'Vellore, Tamil Nadu', type: 'SPIRITUAL', budget: 'BUDGET', min: 300, max: 1000, days: 1,
    summary: 'A well-known temple complex on the outskirts of Vellore.',
    description: 'A temple complex with landscaped grounds, popular as a day trip from Vellore. Visitor rules such as dress code and photography limits apply.',
    tips: ['Confirm visiting hours and dress code in advance.', 'Expect queues on weekends and festival days.', 'Carry only what you need; security checks are common.'] },
  { slug: 'yelagiri-hills', name: 'Yelagiri Hills', region: 'Tirupattur district, Tamil Nadu', type: 'NATURE', budget: 'MODERATE', min: 1500, max: 4500, days: 2,
    summary: 'A hill-station weekend within reach of Vellore.',
    description: 'A small hill station with viewpoints, a lake and trekking trails, commonly used for weekend trips from nearby cities.',
    tips: ['Book stays ahead on weekends and holidays.', 'Roads are winding; plan daylight travel.', 'Carry water and light rain cover.'] },
  { slug: 'mahabalipuram', name: 'Mahabalipuram', region: 'Chengalpattu district, Tamil Nadu', type: 'HERITAGE', budget: 'MODERATE', min: 2500, max: 6000, days: 2,
    summary: 'Coastal town known for ancient rock-cut monuments and a beach.',
    description: 'A UNESCO-listed group of monuments beside the Bay of Bengal. Pair the monuments with an evening at the shore.',
    tips: ['Start with the monuments in the morning light.', 'Check ticket rules for each protected site.', 'Beach swimming can be unsafe; follow local warnings.'] },
  { slug: 'pondicherry', name: 'Pondicherry (Puducherry)', region: 'Puducherry', type: 'BEACH', budget: 'MODERATE', min: 3000, max: 8000, days: 3,
    summary: 'A coastal town with a French-quarter street layout and seafront.',
    description: 'Known for its seafront promenade, cafes and a distinctive old-town grid. A popular long-weekend option for students in the region.',
    tips: ['Rent a bicycle or scooter for the old town if you have a valid licence.', 'Book accommodation early for holiday weekends.', 'Check local rules before planning night-time beach plans.'] },
  { slug: 'chennai-city-break', name: 'Chennai city break', region: 'Chennai, Tamil Nadu', type: 'CITY', budget: 'PREMIUM', min: 4000, max: 12000, days: 3,
    summary: 'A big-city weekend: museums, markets, the Marina and food.',
    description: 'The state capital offers museums, beaches, markets and a wide food scene. Costs vary a lot with where you stay and how you travel.',
    tips: ['Use public transport or ride-hailing for traffic-heavy hours.', 'Plan one area per day to limit travel time.', 'Check museum closing days.'] }
];

const resources = [
  ...['Computer Science and Engineering', 'Electronics and Communication', 'Mechanical Engineering', 'Business Administration', 'Mathematics and Sciences']
    .map((t) => ({ kind: 'DEPARTMENT', category: 'Academics', title: t, summary: 'Sample department entry. Programmes, faculty and contact details are not included.', details: 'Replace this sample with verified department information from your institution.' })),
  { kind: 'LIBRARY', category: 'Textbooks', title: 'Core textbooks collection', summary: 'Sample category for prescribed engineering and science textbooks.', details: 'Borrowing and availability are not implemented in this project.' },
  { kind: 'LIBRARY', category: 'Journals', title: 'Journals and periodicals', summary: 'Sample category for print and online academic journals.', details: 'Access rules depend on your institution.' },
  { kind: 'LIBRARY', category: 'Digital', title: 'Digital library portal', summary: 'Sample entry for e-books and databases.', details: 'No live catalogue is connected.' },
  { kind: 'LIBRARY', category: 'Past papers', title: 'Previous question papers', summary: 'Sample entry for exam practice material.', details: 'Replace with your institution\'s verified resource list.' },
  { kind: 'LIBRARY', category: 'Reference', title: 'Reference and thesis section', summary: 'Sample entry for reference-only volumes and project reports.', details: 'In-library use only in most institutions; confirm locally.' },
  { kind: 'FACILITY', category: 'Services', title: 'Computer labs', summary: 'Sample facility entry for programming and project labs.', details: 'Opening hours are not provided here.' },
  { kind: 'FACILITY', category: 'Services', title: 'Sports complex', summary: 'Sample facility entry for indoor and outdoor sports.', details: 'Opening hours are not provided here.' },
  { kind: 'FACILITY', category: 'Services', title: 'Cafeteria and food court', summary: 'Sample facility entry for campus dining.', details: 'Menus and timings are not provided here.' },
  { kind: 'SUPPORT', category: 'Help', title: 'Student help desk', summary: 'Sample entry for general student queries.', details: 'No phone number or email is shown because none has been verified. Add your institution\'s official contact.' },
  { kind: 'SUPPORT', category: 'Help', title: 'Counselling and wellbeing', summary: 'Sample entry for student wellbeing support.', details: 'If you need urgent help, contact local emergency services or a trusted person. This app is not a crisis service.' },
  { kind: 'SUPPORT', category: 'Help', title: 'Placement cell', summary: 'Sample entry for career guidance and recruitment.', details: 'Add the official contact for your institution.' },
  { kind: 'LINK', category: 'Links', title: 'Official institution website', summary: 'Always verify admin information on your institution\'s own website.', details: 'No URL is hard-coded because none has been verified for your institution.' },
  { kind: 'ORGANIZATION', category: 'Fictional company', title: 'Example Tech Pvt Ltd (fictional)', summary: 'A made-up company profile used to demonstrate the profile card layout.', details: 'Industry: software services. This organisation does not exist.' },
  { kind: 'ORGANIZATION', category: 'Fictional company', title: 'Sample Analytics Labs (fictional)', summary: 'A made-up company profile used to demonstrate the profile card layout.', details: 'Industry: data analytics. This organisation does not exist.' }
];

const employees = [
  { employeeId: 'EMP-1001', name: 'Sample Employee One (fictional)', designation: 'Assistant Professor', department: 'Computer Science', email: 'employee1@example.test', phone: '9876500001' },
  { employeeId: 'EMP-1002', name: 'Sample Employee Two (fictional)', designation: 'Lab Technician', department: 'Electronics', email: 'employee2@example.test', phone: null },
  { employeeId: 'EMP-1003', name: 'Sample Employee Three (fictional)', designation: 'Librarian', department: 'Library', email: 'employee3@example.test', phone: null }
];

async function main() {
  if (!(await db.event.count({ where: { isDemo: true } }))) {
    await db.event.createMany({ data: events.map(({ d, h, ...e }) => ({ ...e, startsAt: inDays(d, h), endsAt: inDays(d, h + 3) })) });
  }
  for (const { min, max, days, ...d } of destinations) {
    await db.destination.upsert({ where: { slug: d.slug }, update: {}, create: { ...d, budgetMinInr: min, budgetMaxInr: max, recommendedDays: days } });
  }
  if (!(await db.resource.count({ where: { isDemo: true } }))) await db.resource.createMany({ data: resources });
  for (const e of employees) {
    await db.employee.upsert({ where: { employeeId: e.employeeId }, update: {}, create: { ...e, joinedOn: new Date('2022-07-01'), isDemo: true } });
  }
  console.log('Demo data ready.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
