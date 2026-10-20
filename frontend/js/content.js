// Home page content. Kept as data so modules can be added without touching markup.
const icon = (d) => `<svg class="service__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const SERVICES = [
  { href: '/dashboard', title: 'Student Dashboard', text: 'Timetable, attendance, grades and deadlines at a glance, personalised to your course.',
    icon: icon('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>') },
  { href: '/services', title: 'Campus Services', text: 'Library, hostel, transport, canteen and help desk requests without the queues.',
    icon: icon('<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>') },
  { href: '/events', title: 'Events & Clubs', text: 'Discover fests, workshops and club meets, then RSVP and add them to your calendar.',
    icon: icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2"/>') },
  { href: '/labs', title: 'Interactive Labs', text: 'Book lab benches and run guided virtual experiments before you step inside.',
    icon: icon('<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>') },
  { href: '/assistant', title: 'AI Assistant', text: 'Ask anything about your campus and get clear, instant answers around the clock.',
    icon: icon('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>') },
  { href: '/assistant?mode=voice', title: 'Voice Access', text: 'Hands-free help while you walk between classes. Speak naturally, hear it back.',
    icon: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>') }
];

const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

export const SPACES = [
  { href: '/services', cat: 'Library', title: 'Central Library', tags: ['Seat booking', 'E-resources', 'Open late'],
    src: img('photo-1481627834876-b7833e8f5570'), alt: 'Tall library shelves filled with books' },
  { href: '/labs', cat: 'Interactive Labs', title: 'Science & Innovation Labs', tags: ['Bench slots', 'Virtual demos', 'Safety guides'],
    src: img('photo-1532094349884-543bc11b234d'), alt: 'Student working with lab equipment' },
  { href: '/events', cat: 'Events', title: 'Fests & Seminars', tags: ['RSVP', 'Clubs', 'Reminders'],
    src: img('photo-1523580494863-6f3031224c94'), alt: 'Students listening to a speaker at a campus seminar' },
  { href: '/dashboard', cat: 'Student Life', title: 'Study Commons', tags: ['Group rooms', 'Peer study', 'Wi-Fi'],
    src: img('photo-1517245386807-bb43f82c33c4'), alt: 'Student taking notes beside a laptop' },
  { href: '/services', cat: 'Quiet Zones', title: 'Reading Hall', tags: ['Silent study', 'Seat booking', 'Late hours'],
    src: img('photo-1498243691581-b145c3f54a5a'), alt: 'Long reading hall lined with bookshelves' },
  { href: '/services', cat: 'Campus Grounds', title: 'Heritage Main Block', tags: ['Maps', 'Admin office', 'Shuttle stops'],
    src: img('photo-1562774053-701939374585'), alt: 'Historic university main building framed by trees' }
];
