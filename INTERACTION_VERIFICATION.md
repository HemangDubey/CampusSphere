# Interaction verification

How each interactive control was verified. Verification levels, strongest first:

- **API** – the control's backend call is covered by an automated integration test (`npm test`), including negative paths.
- **Browser** – the control was clicked in the in-app browser during development.
- **Code** – the handler exists and is wired, but was not exercised by a test or a browser run.

Not verified anywhere: real microphone dictation, real speech synthesis, real screenshots, and a physical phone. Automated DOM tests do not exist; the
`frontend.test.js` suite checks that every page, script, import and route resolves and that no unused imports remain.

| Page | Control | Expected behaviour | Endpoint | Persists | Level |
| --- | --- | --- | --- | --- | --- |
| Shell | Sidebar collapse | Icon-only mode, remembered | – | localStorage | Browser |
| Shell | Mobile menu / ✕ / backdrop / Esc | Drawer opens/closes, focus returns | – | – | Browser (375 px) |
| Shell | Notification bell | Unread count, list, mark read | `/notifications*` | DB | API + Browser |
| Shell | Sign out | Session revoked | `POST /auth/logout` | DB | API |
| Register / Login | Submit | Validation, account created, cookie set, rate limited | `/auth/*` | DB | API + Browser |
| Events | Search, filters, sort, pagination | Server-side filtering | `GET /events` | – | API + Browser |
| Event detail | Register | Wizard → review → receipt with reference | `POST /events/:id/register` | DB | API + Browser |
| Event detail | Cancel registration | Seat released, status CANCELLED | `DELETE /events/:id/register` | DB | API |
| My events | List / cancel | Own registrations only | `/events/mine` | DB | API |
| Organizer | Create, edit, publish, cancel event | Ownership enforced | `/manage/events*` | DB | API + Browser |
| Organizer | Attendance, CSV export | Formula-safe CSV | `/manage/events/:id/*` | DB | API |
| Travel | Filters, sort, save | Favourite toggled | `/destinations*` | DB | API + Browser |
| Destination | Add to trip, share | Creates/updates trip | `/trips*` | DB | API |
| My trips / Trip | Create, edit items, reorder, expenses, duplicate, delete, share, collaborators | Owner/editor/viewer rules | `/trips*` | DB | API (UI: Browser for create/add) |
| Resources | Search, category, bookmark | – | `/resources*` | DB | API + Browser |
| Resource detail | Start request / report issue | Wizard with server receipt | `POST /service-requests` | DB | API + Browser |
| Requests | Track, respond, cancel | Status engine | `/service-requests*` | DB | API |
| Admin requests | Assign, transition, notes | Self-review blocked | `/manage/requests*` | DB | API |
| Reading list | Add/remove | – | `/reading-list*` | DB | API |
| Healthcare | Book, reschedule, cancel | No double booking | `/healthcare/appointments*` | DB | API + Browser (book) |
| Admin healthcare | Confirm/decline/complete, manage services, providers, slots | Reasons required | `/manage/healthcare/*` | DB | API |
| Leave | Request, withdraw, respond | Overlap and date rules | `/leave*` | DB | API + Browser |
| Admin leave | Approve/reject/ask info | Self-approval blocked | `/manage/leave*` | DB | API |
| Dashboard | All widgets | Real counts | `/dashboard` | – | API + Browser |
| Games (6) | Play, difficulty, submit score, leaderboard | Rules in `logic.js`; server validates ranges | `/games/*` | DB | Logic: unit tests; UI: Browser; scores: API |
| Admin | Users and roles, content CRUD, announcements, audit, reports | `*:manage` permissions | `/admin/*` | DB | API + Browser (spot checks) |
| Employees | CRUD | Admin only | `/employees*` | DB | API |
| Checkout / Courses | Forms and registration | Demonstration only | `/checkout`, `/courses*` | DB | API |
| AI Assistant | Send, example prompts, clear, errors | Real reply or clear unavailable state | `POST /ai/chat` | – | Stubbed API tests; one live reply obtained from the dev machine |
| AI Assistant | Voice dictation, read-aloud | Browser speech APIs | – | – | **Code only** (simulated recognizer; microphone blocked in the test pane) |
| Mouse / Keyboard labs | Coursework exercises | – | – | – | Browser (earlier prompts) |

Known limitations: dialogs' `close` events do not fire in the in-app browser pane (handled by explicit cleanup); notification delivery is in-app only.
