# Screenshot checklist

**No screenshots have been captured or stored in this repository.** Capture these manually for the presentation and coursework
evidence. Run `npm run dev`, use a normal browser window (1280 px wide unless noted), keep the address bar visible, and save as `screenshots/NN-name.png`.

Setup: `npm run db:seed`; register students A and B; promote others with
`npm run admin:promote -- email ROLE` (ROLE = EVENT_ORGANIZER, HEALTHCARE_ADMIN, CAMPUS_ADMIN or SUPER_ADMIN).

| # | State | URL | Signed in as |
| --- | --- | --- | --- |
| 01 | Landing page, top and scrolled; 02 at 375 px | `/` | – |
| 03 | Register with validation errors; 04 login | `/register`, `/login` | – |
| 05 | Dashboard, expanded sidebar; 06 collapsed; 07 mobile drawer (375 px) | `/dashboard` | Student A |
| 08 | Notification bell open | any | Student A |
| 09 | Events list with filters; 10 event detail | `/events`, `/events/:id` | Student A |
| 11 | Registration wizard review step; 12 receipt with reference | event detail | Student A |
| 13 | My events; 14 full event (capacity) | `/events/mine` | A, B |
| 15 | Organizer: events list, edit form, registrants + attendance | `/organizer/events` | Organizer |
| 16 | Travel explorer filters; 17 destination detail | `/travel` | Student A |
| 18 | Trip planner with items and expenses; 19 share dialog | `/trips/:id` | Student A |
| 20 | Resources by category; 21 resource detail; 22 service request wizard | `/resources` | Student A |
| 23 | Request tracking with timeline; 24 info-required response | `/requests/:id` | Student A |
| 25 | Admin request queue and transition dialog | `/admin/requests` | Campus Admin |
| 26 | Healthcare: services, slot picker, confirmation | `/healthcare` | Student A |
| 27 | Healthcare admin: appointments, slot management | `/admin/healthcare` | Healthcare Admin |
| 28 | Leave request; 29 leave decision | `/leave`, `/admin/leave` | Student A / Campus Admin |
| 30 | Games hub; 31 each of the six games; 32 leaderboard | `/games` | Student A |
| 33 | Admin: users and roles; 34 audit log; 35 reports | `/admin/users` etc. | Super Admin |
| 36 | A student visiting an admin URL (access denied) | `/admin/users` | Student A |
| 37 | Employees page; 38 course registration; 39 checkout (demo banner) | `/employees`, `/courses`, `/checkout` | Admin / A |
| 40 | Mouse lab; 41 keyboard lab (Shift+A, Ctrl+Enter) | `/labs/mouse`, `/labs/keyboard` | A |
| 42 | AI Assistant empty state; 43 **real reply** (needs a valid key); 44 error with Retry (works with no key) | `/assistant` | A |
| 45 | Voice dictation and read aloud (Chrome/Edge, localhost or HTTPS, allow microphone) | `/assistant` | A |
