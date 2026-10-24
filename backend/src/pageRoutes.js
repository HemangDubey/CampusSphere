// Page routes served by the app: clean URL pattern -> HTML file. "app" pages use the sidebar shell (see js/shell.js).
// Patterns use ":param" segments; the page's JavaScript reads the value from location.pathname.
const APP_PAGES = [
  { route: '/dashboard', file: 'dashboard.html', js: 'dashboard', title: 'Dashboard' },
  { route: '/notifications', file: 'notifications.html', js: 'notifications', title: 'Notifications' },
  { route: '/activity', file: 'activity.html', js: 'activity', title: 'My Activity' },
  { route: '/events', file: 'events.html', js: 'events', title: 'Events & Symposiums' },
  { route: '/events/:id', file: 'event-detail.html', js: 'event-detail', title: 'Event' },
  { route: '/travel', file: 'travel.html', js: 'travel', title: 'Travel Explorer' },
  { route: '/travel/:slug', file: 'destination-detail.html', js: 'destination-detail', title: 'Destination' },
  { route: '/trips', file: 'trips.html', js: 'trips', title: 'My Trips' },
  { route: '/trips/shared/:token', file: 'trip-shared.html', js: 'trip-shared', title: 'Shared Trip' },
  { route: '/trips/:id', file: 'trip-editor.html', js: 'trip-editor', title: 'Trip Planner' },
  { route: '/resources', file: 'resources.html', js: 'resources', title: 'Campus Resources' },
  { route: '/resources/:id', file: 'resource-detail.html', js: 'resource-detail', title: 'Resource' },
  { route: '/library', file: 'library.html', js: 'library', title: 'Library' },
  { route: '/community', file: 'community.html', js: 'community', title: 'Student Community' },
  { route: '/community/posts/:id', file: 'community-post.html', js: 'community-post', title: 'Community Post' },
  { route: '/community/groups', file: 'groups.html', js: 'groups', title: 'Clubs & Groups' },
  { route: '/community/groups/:id', file: 'group-detail.html', js: 'group-detail', title: 'Group' },
  { route: '/healthcare', file: 'healthcare.html', js: 'healthcare', title: 'Healthcare' },
  { route: '/appointments', file: 'appointments.html', js: 'appointments', title: 'My Appointments' },
  { route: '/leave', file: 'leave.html', js: 'leave', title: 'Leave Requests' },
  { route: '/leave/:id', file: 'leave-detail.html', js: 'leave-detail', title: 'Leave Request' },
  { route: '/approvals', file: 'approvals.html', js: 'approvals', title: 'Leave Approvals' },
  { route: '/requests', file: 'requests.html', js: 'requests', title: 'Service Requests' },
  { route: '/requests/:id', file: 'request-detail.html', js: 'request-detail', title: 'Service Request' },
  { route: '/courses', file: 'courses.html', js: 'courses', title: 'Student Services' },
  { route: '/games', file: 'games.html', js: 'games', title: 'Games & Recreation', extraCss: ['games'] },
  { route: '/games/:game', file: 'game.html', js: 'game', title: 'Game', extraCss: ['games'] },
  { route: '/coursework', file: 'coursework.html', js: 'coursework', title: 'Coursework' },
  { route: '/checkout', file: 'checkout.html', js: 'checkout', title: 'Checkout' },
  { route: '/employees', file: 'employees.html', js: 'employees', title: 'Employee Records' },
  { route: '/admin', file: 'admin.html', js: 'admin', title: 'Admin Dashboard' },
  { route: '/admin/events', file: 'admin-events.html', js: 'admin-events', title: 'Event Management' },
  { route: '/admin/requests', file: 'admin-requests.html', js: 'admin-requests', title: 'Request Queue' },
  { route: '/admin/healthcare', file: 'admin-healthcare.html', js: 'admin-healthcare', title: 'Healthcare Management' },
  { route: '/admin/resources', file: 'admin-resources.html', js: 'admin-resources', title: 'Resource Management' },
  { route: '/admin/content', file: 'admin-content.html', js: 'admin-content', title: 'Content & Announcements' },
  { route: '/admin/moderation', file: 'admin-moderation.html', js: 'admin-moderation', title: 'Community Moderation' },
  { route: '/admin/users', file: 'admin-users.html', js: 'admin-users', title: 'Users & Roles' },
  { route: '/admin/reports', file: 'admin-reports.html', js: 'admin-reports', title: 'Reports & Audit Logs' }
];

// Pages that keep their own full HTML (public header, coursework files, or the assistant chat).
const OTHER_PAGES = [
  { route: '/assistant', file: 'assistant.html' },
  
  { route: '/labs/mouse', file: 'mouse-lab.html' },
  { route: '/labs/keyboard', file: 'keyboard-lab.html' },
  { route: '/login', file: 'login.html' },
  { route: '/register', file: 'register.html' },
  { route: '/forgot-password', file: 'forgot-password.html' },
  { route: '/reset-password', file: 'reset-password.html' },
  { route: '/about', file: 'about.html' },
  { route: '/contact', file: 'contact.html' },
  { route: '/privacy', file: 'privacy.html' },
  { route: '/terms', file: 'terms.html' }
];

const compile = (p) => ({ ...p, regex: new RegExp(`^${p.route.replace(/:[a-zA-Z]+/g, '[^/.]+')}/?$`) });
// More specific patterns (no params, then longer routes) must win: /trips/shared/:token before /trips/:id.
const ROUTES = [...APP_PAGES, ...OTHER_PAGES].map(compile).sort((a, b) => (a.route.includes(':') - b.route.includes(':')) || b.route.length - a.route.length);

const match = (pathname) => ROUTES.find((r) => r.regex.test(pathname));
module.exports = { APP_PAGES, OTHER_PAGES, ROUTES, match };
