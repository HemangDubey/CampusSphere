// Home page content. Kept as data so modules can be added without touching markup.
// The wording describes what the product actually does; layout and styling are unchanged.
const icon = (d) => `<svg class="service__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const SERVICES = [
  { href: '/dashboard', title: 'Student Dashboard', text: 'Your upcoming events, open requests, leave and appointment status and notifications, all in one place.',
    icon: icon('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>') },
  { href: '/resources', title: 'Campus Services', text: 'Browse departments, the library and student support, and send service requests you can track.',
    icon: icon('<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>') },
  { href: '/events', title: 'Events & Symposiums', text: 'Discover workshops, symposiums and fests, register in a few steps and keep your reference.',
    icon: icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2"/>') },
  { href: '/games', title: 'Games & Recreation', text: 'Six quick games for a break between classes: memory, reaction, typing, patterns, trivia and a maze.',
    icon: icon('<path d="M6 11h4M8 9v4"/><path d="M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-3.9 3.2l-1.6 7.1A3 3 0 0 0 4.1 19c1 0 1.8-.5 2.4-1.2L8 16h8l1.5 1.8c.6.7 1.4 1.2 2.4 1.2a3 3 0 0 0 2.9-3.7l-1.6-7.1A4 4 0 0 0 17.3 5z"/>') },
  { href: '/assistant', title: 'AI Assistant', text: 'Ask about coursework, programming and how things work in CampusSphere. Answers are general guidance, not official campus data.',
    icon: icon('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>') },
  { href: '/assistant', title: 'Voice Access', text: 'Dictate a question and hear the answer read aloud, where your browser supports speech.',
    icon: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>') }
];

const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

export const SPACES = [
  { href: '/library', cat: 'Library', title: 'Central Library', tags: ['Catalogue search', 'Reading list', 'Suggest a book'],
    src: img('photo-1481627834876-b7833e8f5570'), alt: 'Tall library shelves filled with books' },
  { href: '/resources', cat: 'Facilities', title: 'Science & Innovation Labs', tags: ['Directory', 'Access requests', 'Save for later'],
    src: img('photo-1532094349884-543bc11b234d'), alt: 'Student working with lab equipment' },
  { href: '/events', cat: 'Events', title: 'Fests & Seminars', tags: ['Register', 'Reference numbers', 'My events'],
    src: img('photo-1523580494863-6f3031224c94'), alt: 'Students listening to a speaker at a campus seminar' },
  { href: '/community', cat: 'Student Life', title: 'Study Commons', tags: ['Clubs', 'Announcements', 'Community'],
    src: img('photo-1517245386807-bb43f82c33c4'), alt: 'Student taking notes beside a laptop' },
  { href: '/library', cat: 'Quiet Zones', title: 'Reading Hall', tags: ['Reading list', 'Saved resources', 'Search'],
    src: img('photo-1498243691581-b145c3f54a5a'), alt: 'Long reading hall lined with bookshelves' },
  { href: '/resources', cat: 'Campus Grounds', title: 'Heritage Main Block', tags: ['Departments', 'Support', 'Directory'],
    src: img('photo-1562774053-701939374585'), alt: 'Historic university main building framed by trees' }
];
