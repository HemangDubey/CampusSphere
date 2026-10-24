# Functionality audit

Scope: the state of the project **before** the platform upgrade (commit `2a96e1a`), what was wrong, what was required, and what was
done. The audit was made by reading the code and exercising the running app. **No screenshots or demonstration video were attached
to the request, so nothing here is based on them.** The 41 coursework question texts are still not available (see COURSEWORK_COVERAGE.md).

Status legend: **FIXED** (implemented and tested), **PARTIAL** (implemented, with a stated gap), **BLOCKED** (needs something outside the code).

## Findings by module

| Module | Previous implementation | Problem found | Required behaviour | Backend / API | Database | Test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Navigation | Top bar with 9 links on every page | Primary navigation crammed into the top bar, wrapped at some widths, no role awareness | Collapsible sidebar (icon-only desktop mode, mobile drawer, Esc, active route, tooltips, user card, logout), sections incl. role-gated Administration | `/api/auth/me` returns `permissions` for display only | – | Browser: collapse persists, drawer open/Esc/backdrop/✕, focus return, no overflow at 375 px; test suite checks every route/page/script | FIXED |
| Roles | `STUDENT`, `FACULTY`, `ADMIN`; only employees were admin-gated; faculty did nothing | No real multi-role system; `ADMIN` was a single blunt role | Student, Faculty/Staff, Event Organizer, Healthcare Admin, Campus Admin, Super Admin with backend permissions and object-level checks | `permissions.js`, `requirePermission`, per-record checks in controllers; `admin:promote` script; role/status changes revoke sessions and are audited | `Role` enum (6 values), `UserStatus`, migration maps old `ADMIN` to `SUPER_ADMIN` | `admin.test.js` role-by-endpoint matrix (anonymous / each role), self-promotion, registration ignores `role`, suspension, session revocation | FIXED |
| Events | Single "Register" click that created a row; delete-on-cancel; no organizer tools | Not a real workflow; no deadlines, status, attendance, details page | Details page, filters/sort, registration form + review + server receipt, duplicate/capacity/window rules, cancel, organizer create/edit/publish/cancel/attendance/CSV | `/api/events*`, `/api/manage/events*` (serializable transaction for seats) | `Event` (status, organizer, window, fee…), `EventRegistration` (reference, status, answers, attendance) | `events.test.js` (≈90 assertions incl. race, ownership, CSV formula safety, audit) + browser wizard run | FIXED |
| Travel | Cards with Save and a details dialog | Save/Details were thin; no planner | Filters/sort, detail page, itineraries, trip planner (items, reorder, expenses, duplicate, share, collaborators), favourites page, recently viewed | `/api/destinations*`, `/api/trips*` | `Destination` (+ activities, itineraries, best time…), `Trip`, `TripItem`, `TripMember`, `RecentDestinationView` | `travel.test.js` (ownership, viewer/editor, share link, duplicate, cascade) | FIXED (no real photos/maps/prices: see Placeholders) |
| Resources | Static cards with a details dialog | No actions at all | Categories, detail page, bookmarks, report an issue, service-request workflow with reference, tracking, staff queue | `/api/resources*`, `/api/service-requests*`, `/api/manage/requests*` | `ResourceCategory`, `Resource` (+ eligibility, form fields…), `ResourceBookmark`, `ServiceRequest`, `StatusHistory` | `resources.test.js` (status engine, assignment, overdue, self-review blocked, visibility) + browser wizard | FIXED |
| Library | Part of the resource list | No library-specific behaviour | Search, categories, detail, saved items, reading list; no fake borrowing | `/api/reading-list*` | `ReadingListItem` | `resources.test.js` | PARTIAL: borrowing/reservation intentionally **not implemented** and stated in the UI |
| Healthcare | Info cards + one request form | No schedule, no admin workflow, phone echoed back | Services, providers, slots, booking, reschedule, cancel, admin review with reasons, no double-booking, privacy | `/api/healthcare/*`, `/api/manage/healthcare/*` | `HealthService`, `HealthProvider`, `HealthSlot`, new `Appointment` (unique slot) | `healthcare.test.js` (concurrent booking, blocked slots, transitions, privacy) + browser booking | FIXED (demonstration data; disclosed) |
| Leave | Did not exist | – | Request, overlap/date rules, reviewer decisions, info requests, withdraw, audit, no self-approval | `/api/leave*`, `/api/manage/leave*` | `LeaveRequest`, `StatusHistory` | `leave.test.js` (self-approval blocked even for admins) + browser wizard | FIXED (demo rules, labelled) |
| Notifications / activity | Did not exist | – | Real, persisted notifications with unread count, mark read, activity history | `/api/notifications*`, `/api/activity` | `Notification` | asserted inside events/leave/resources/admin suites | FIXED (in-app only; no email/SMS/push) |
| Audit log | Did not exist | – | Access-controlled record of admin actions without secrets | `/api/admin/audit` | `AuditLog` | `admin.test.js` | FIXED |
| Admin content management | Employees only | Nothing else was manageable | CRUD/lifecycle for events, destinations, resources, categories, announcements, healthcare services/providers/slots, users/roles | `/api/admin/*`, `/api/manage/*` | as above + `Announcement` | `admin.test.js`, `healthcare.test.js`, `events.test.js` + browser | FIXED |
| Dashboard | Profile form and an events list | Not personalised or actionable | Upcoming events, pending items, notifications, saved items, announcements, completeness, staff workload | `/api/dashboard` | – | `admin.test.js` + browser | FIXED |
| AI Assistant | Chat UI + endpoint; failed for the user | **Root cause: the default model name was no longer offered by the provider**, so every request was rejected and hidden behind a generic 502; intermittent IPv6/DNS connect stalls made it worse | A working, honest assistant; clear errors; grounded in real app data; no fake answers | `aiService.js` (model env, IPv4-first, one retry, safe server log), `aiContext.js` | – | **A real reply was obtained end to end** (see below); stubbed suite covers error mapping and data scoping | FIXED (live reply verified once from the dev machine; depends on a valid key and reachable provider) |
| Labs | Prominent "Labs" nav item | Felt like a coursework area | Games & Recreation in the main product; coursework kept separately | `/api/games*` | `GameScore` | `games.test.js` (rules), `admin.test.js` (scores), browser: all six games played | FIXED |
| Coursework Q01–Q41 | Mouse/keyboard labs, Bootstrap demo, forms | Question wording unavailable | Keep evidence; do not guess | – | – | – | BLOCKED (needs the questions) |
| Landing page | Approved design | Copy advertised features that do not exist (timetables, bench booking, a fake AI reply that "books" a lab, invented opening hours) | Keep the design, make the claims true | – | – | `frontend.test.js` rejects the old claims | FIXED (wording only; layout and styling untouched) |

## AI Assistant: root cause

Reproduced with the real key present in the environment:

1. `GET /models` returned the provider's current catalogue; the configured default `llama-3.3-70b-versatile` was **not in it**.
2. Calling the chat endpoint with that model returned HTTP 404 `model_not_found`. The old service mapped every non-401 failure to a generic 502, so the UI only said "could not complete that request" and the cause was invisible.
3. Separately, DNS for the provider intermittently timed out and resolved to an IPv6 address first, causing 5–10 s connect stalls and occasional connection timeouts.

Fix: default model changed to `openai/gpt-oss-120b` (still overridable with `GROQ_MODEL`), IPv4-first resolution, one retry on connection failure,
a 404/400/401/403 from the provider is now reported as "not available" (an operator problem) and logged **server-side only** (status and error code, never the key or prompt).
A real reply was received through `aiService.complete()`; a deliberately wrong model name now yields a clean `AI_UNAVAILABLE` plus a server log line `[ai] upstream status 404 model_not_found`.

## Controls that previously did nothing or only changed appearance

Event "Register" (created a row with no checks), event/destination "Details" dialogs with no content beyond the card, "Save" on resources (did not exist),
healthcare cards with no action, "Labs" cards, the landing page "Book a bench" claims, the AI teaser question box (did not prefill the assistant).
All are replaced by working flows or removed; see INTERACTION_VERIFICATION.md.

## Placeholders and sample data

- Seeded content is flagged `isDemo` and shown with a small "Sample" badge. A concise notice per page replaces the previous large banners.
- Travel destinations have **no real photographs**: the landing page's verified photos are reused where relevant (events, library), everything else gets a generated cover; administrators can paste an https image URL per item.
- No contact details, opening hours or policies are invented; the footer's made-up address and hours were removed.

## Things that could not be done

- Real photography for destinations, real maps/booking/prices, real hospital data, a mail/SMS provider, a payment gateway, and file uploads (no safe upload handling exists, so no feature asks for documents).
- Standalone coursework pages (needs the original questions).
