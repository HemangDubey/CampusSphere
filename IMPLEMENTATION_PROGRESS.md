# CampusSphere — Implementation Progress

Source spec: `frontend prompts.docx` (7 combined prompts). Updated after every prompt.

## Repository baseline (inspected before Prompt 1)
- Frontend: multi-page **vanilla HTML + ES modules** (no React/Vite). Kept as is; the spec says not to migrate frameworks.
- Backend: zero-dependency Node `http` server. Express was added in Prompt 1 as the spec asks.
- No Prisma/PostgreSQL yet (Prompt 2). Docker is installed locally; `psql` is not.
- Vendored Bootstrap 5.3.3 lives at `frontend/vendor/bootstrap-5.3.3/` (kept there).
- **The 41 coursework question texts are not in the repo.** Only the 7 build prompts were supplied. Q01–Q41 will be tracked as `NEEDS ORIGINAL SPECIFICATION` until the questions are provided.
- Security note: the supplied prompt text contained what looks like a real Groq API key. It is not stored anywhere in this repo. Revoke it and put a new key in `backend/.env` only.

## Prompt 1 — Design system, auth UI, backend foundation: DONE
Implemented
- Design tokens/components already existed; added reusable password-toggle input (`auth.css`) and `data-match` cross-field validation in `js/forms.js`.
- Pages: `/login`, `/register`, `/forgot-password`, `/reset-password` (`frontend/pages/*.html`, `js/auth.js`, `css/auth.css`).
- API layer `frontend/js/api.js` (base URL from `<meta name="api-base">`, timeout, error normalisation, `authApi`).
- Express app: `backend/src/{config,app,server}.js`, `middleware/errorHandler.js`, `utils/response.js`, `routes/*` with envelope `{success,data}` / `{success:false,error:{code,message}}`.
- Auth endpoints are 501 stubs so the UI cannot show a fake sign-in.
- `backend/.env.example` (placeholders only), `backend/package.json` (express, cors, dotenv); root scripts delegate to `backend/`.

Verified (actually run)
- `npm test` → "All smoke tests passed" (pages 200, health envelope, 404 envelope, invalid JSON 400, newsletter validation, auth 501).
- Browser: `/register` renders; empty submit shows 4 required errors; bad email/short password/mismatched confirm show the right messages; valid submit shows the honest "not available yet" notice; password toggle works; all auth routes 200.
- No frontend build/lint step exists (no bundler); not run.
- Not run: tablet/mobile visual pass, keyboard-only walkthrough.

Next: Prompt 2 (PostgreSQL + Prisma, real auth, dashboard).

## Prompt 2 — PostgreSQL, secure auth, dashboard: DONE
Implemented
- Prisma 6 + PostgreSQL (`backend/prisma/schema.prisma`, migration `20261024133432_init`): `User` (unique email, role enum, profile fields), `Session`, `PasswordResetToken`.
- Local dev DB: Docker container `campussphere-pg` (postgres:16-alpine, host port 5433), URL in git-ignored `backend/.env`. Hosted Neon works by changing `DATABASE_URL` only.
- Auth: bcryptjs (12 rounds); signed JWT in an HTTP-only, SameSite cookie carrying a session id; each session is a DB row, so logout/password reset revoke it server-side. Nothing sensitive in localStorage.
- Endpoints: `POST /api/auth/register|login|logout|forgot-password|reset-password`, `GET|PATCH /api/auth/me`. Rate limit on auth routes, Origin check for cookie CSRF, server-side validation, generic login error, role not user-editable.
- Password reset: random token, only SHA-256 hash stored, 30 min expiry, single use, revokes sessions. **No mail provider is configured, so no email is sent**; in development the link is printed to the server console only.
- Frontend: `/dashboard` (protected, redirects to `/login?next=...`; welcome, profile summary and edit, quick links, loading/error states, responsive sidebar), `login` honours safe `next`.
- Upcoming events panel is an honest empty state until the events module exists (Prompt 3).

Verified (actually run)
- `npm test` (backend): smoke, auth (validation, duplicate, session persistence, logout revocation, forged cookie, generic login error, CSRF origin, reset single-use/expiry, hashing) and rate-limit tests all passed against the real local database.
- Browser: dashboard redirects when signed out; register → dashboard; refresh keeps the session; cookie not visible to JS; profile save works; logout returns to `/login` and `/api/auth/me` then answers 401.
- Not run: expiry of a real 7-day session, mobile layout screenshots, `prisma migrate deploy` against a hosted DB.

Environment: see `backend/.env.example` (DATABASE_URL, JWT_SECRET, SESSION_DAYS, COOKIE_SAMESITE, AUTH_RATE_LIMIT_MAX).
Next: Prompt 3 (events, travel explorer, campus resources).

## Prompt 3 — Events, travel explorer, campus resources: DONE
Implemented
- Migration `20261024133814_events_travel_resources`: `Event`, `EventRegistration` (unique user+event), `Destination`, `FavoriteDestination` (unique user+destination), `Resource`. Demo rows are flagged `isDemo` and seeded by `npm run db:seed` (idempotent; `backend/prisma/seed.js` is the one place to swap in verified data).
- API (`backend/src/routes/campus.js`): `GET /api/events` (search `q`, `category`, `mode`, `from`/`to`, pagination), `GET /api/events/:id`, `GET /api/events/mine` (auth), `POST|DELETE /api/events/:id/register` (auth; capacity, past-event and duplicate checks inside a serializable transaction); `GET /api/destinations` (+`type`, `budget`, `q`), `GET /api/destinations/:slug`, `GET /api/destinations/favorites`, `PUT|DELETE /api/destinations/:id/favorite` (auth, private to the user); `GET /api/resources` (+`kind`, `category`, `q`), `GET /api/resources/:id`.
- Pages: `/events` (filters, tabs for my registrations, details dialog, register/cancel), `/travel` (filters, saved tab, details with tips), `/resources` and `/services` (departments, library with categories/search, facilities, support, links, fictional organisation profiles). Dashboard "Upcoming events" now shows the user's real registrations. Nav/footer link to the new modules; nav CTA becomes "Dashboard" when signed in.
- Honesty: banners label all content as demonstration/sample; travel budgets are marked approximate; no photos, maps, bookings or contact details are invented (travel cards use colour tiles instead of images). Library borrowing/reservation is **not implemented**.

Verified (actually run)
- `npm test` (backend): smoke + auth + rate-limit + campus suites passed. Campus suite covers filters, search, validation errors, full/duplicate/past registration, ownership (another user cannot cancel or see registrations), a simultaneous-request race for the last seat (exactly one wins), favourites without duplicates and their privacy, resource filters.
- Browser (desktop): events search/register/my registrations/details/cancel; travel type filter/save/saved tab/unsave; resources tab/category/search/empty state — all behaved as described. Mobile (375px) travel page has no horizontal overflow.
- Not run: keyboard-only and screen-reader pass, tablet screenshots, cross-browser.
- Console shows 401s on anonymous pages: the nav's "am I signed in" probe (expected).

Coursework mapping: still blocked on the original 41 question texts (see baseline). No question has been marked complete.
Next: Prompt 4 (healthcare, employee management, reusable validation, forms, checkout demo).

## Prompt 4 — Healthcare, forms, employees, checkout demo: DONE (coursework mapping BLOCKED)
Implemented
- Migration `..._healthcare_employees_courses`: `Appointment`, `Employee`, `CourseRegistration`, plus `teamSize`/`track` on `EventRegistration`.
- Reusable validation: `frontend/js/validators.js` (rules + `bindForm`: inline accessible errors, blur/live validation, focus first error, loading state, duplicate-submit guard, server field errors) mirrored by `backend/src/validators/rules.js`; `test/rules.test.js` proves both agree on shared cases.
- Healthcare `/healthcare`: sample categories/hospitals/doctors (all labelled fictional), disclaimer + emergency note, appointment request form, "my requests" with cancel. Requests are stored for demo only and never sent anywhere; phone is not returned by the API; users see only their own.
- Employees `/employees` (+`/api/employees`): admin-only, enforced in backend middleware (`requireRole('ADMIN')`). No default admin: `npm run admin:promote -- user@example.edu` promotes an already-registered user. Sample employees are fictional.
- Course registration `/courses` (sample catalogue), symposium registration form (team size, track, consent) in the events dialog, checkout demo `/checkout`.
- Checkout: server owns prices and totals (client prices ignored), tax/fee labelled illustrative, rejects any card/CVV-style field, returns no transaction id, states clearly that no payment was made. Outcomes: approve/decline/cancel are test switches.
- Not converted: the dashboard profile form and login/register still use the earlier native-validation helper (`forms.js`); they validate on both sides but do not use `bindForm`.

Verified (actually run)
- `npm test`: smoke, rules parity, auth, rate-limit, campus, services suites all passed (healthcare validation + privacy, employee 401/403/admin CRUD/duplicates, course duplicates and ownership, symposium required fields, checkout totals 1300/234/20/1554, tamper and card-field rejection).
- Browser: checkout calculations and approve/decline/cancel result screens, inline errors; healthcare submit/cancel; course register + duplicate error; symposium form; employees blocked for a student and fully working for an admin (add, duplicate ID error).
- Not run: keyboard/screen-reader pass, tablet/mobile pass for the new pages, other browsers.

Coursework: `COURSEWORK_COVERAGE.md` created with Q01–Q41 all `NEEDS ORIGINAL SPECIFICATION`.
Next: Prompt 5 (mouse/keyboard labs, AI backend). The AI key must be supplied by the user in `backend/.env`.

## Prompt 5 — Mouse/keyboard labs and AI Assistant backend: DONE (live AI reply NOT tested — no key)
Implemented
- Labs hub `/labs`, Mouse lab `/labs/mouse` (10 events, each with explanation, zone, latest event + count, reset, keyboard "simulated" trigger; mouseenter/leave vs mouseover/out comparison with counters; contextmenu blocked only inside its zone; touchscreen caveat), Keyboard lab `/labs/keyboard` (keydown/keyup, deprecated keypress indicator, key/code/location/repeat, Shift/Ctrl/Alt/Meta indicators, Ctrl/Cmd+Enter shortcut scoped to the practice box, reset, listeners on the box only with AbortController cleanup, nothing stored or sent).
- AI backend: `POST /api/ai/chat` (`routes/ai.js` → `controllers/ai.js` → `validators/ai.js` + `services/aiService.js`). Signed-in only, per-user rate limit, message ≤2000 chars, history ≤12 messages with role/content validation (extra fields dropped), server-side system instruction (no invented campus data, verify official info, no claimed actions, no config disclosure), timeout, provider-independent `{reply}` response and generic errors (`AI_UNAVAILABLE` 503, `AI_BUSY` 429, `AI_TIMEOUT` 504, `AI_FAILED` 502). Provider call is isolated in `aiService.js` using plain `fetch` (no new dependency). The old `/api/assistant` placeholder was removed.
- Config (server-only, `backend/.env.example`): `GROQ_API_KEY` (empty), `GROQ_MODEL` (default `llama-3.3-70b-versatile`; I could not verify it is still offered, change it in `.env` if the provider rejects it), `AI_TIMEOUT_MS`, `AI_RATE_LIMIT_MAX`.
- Frontend contract: `aiApi.chat({message, history})` in `frontend/js/api.js` (base URL, timeout, cookie auth, ApiError). No chat UI yet (Prompt 6).

Verified (actually run)
- `npm test`: smoke, rules, auth, rate-limit (now incl. AI per-user limit), campus, services, **ai** and **privacy** suites all passed.
- AI suite uses a STUBBED upstream: proves auth, missing-key 503 with no upstream call, 14 invalid payload shapes rejected before any upstream call, only `{reply}` returned, extra history fields not forwarded, upstream 429/500/401/empty/non-JSON/network error and timeout mapped to generic errors with no provider/key/model text. It does NOT prove a real AI answer; no real provider call has been made.
- Privacy suite: no provider/model/key strings in any frontend file; no `gsk_`-style key in tracked or untracked non-ignored files.
- Browser (real input): click, dblclick, mousedown, mousemove, contextmenu fired and updated the zones; keyboard Ctrl+Enter shortcut, key/code/modifier readout and reset worked. Simulated buttons, reset buttons and the enter/over comparison were exercised via script dispatch (counts as expected). Not independently observed with a real device: mouseup/mouseenter/mouseleave/mouseover/mouseout via physical pointer, keypress (the automation does not emit it), Alt/Meta handling, touch devices, screen readers.

Needs from you: a valid key in `backend/.env` (`GROQ_API_KEY=`) to try a real reply; revoke the key that was pasted in the prompt document.
Next: Prompt 6 (AI chat UI, voice, standalone HTML labs, local Bootstrap) — still blocked on the original question wording for the standalone pages.

## Prompt 6 — AI Assistant UI, voice, standalone labs, Bootstrap: DONE except standalone question pages (PENDING by decision)
Implemented
- `/assistant` page (`frontend/pages/assistant.html`, `js/assistant.js`, `js/assistant-core.js`, `css/assistant.css`): sign-in gate, user/assistant bubbles, composer with Enter to send and Shift+Enter for a new line, 2000-character counter/limit, typing indicator, duplicate-send guard, error + Retry on the failed message (no fake reply on failure), New conversation (resets everything) and Clear messages (keeps the draft), example prompts in the empty state, smart scroll with "Jump to latest", bounded history (last 12 successful turns) sent to `/api/ai/chat` through `aiApi`. Replies render as plain text with fenced code blocks; other markdown (e.g. `**bold**`) is shown literally. Title and labels say only "AI Assistant".
- Voice input: Web Speech `SpeechRecognition` (lazy lookup), mic toggle with listening state and accessible name, interim text goes into the composer (never auto-sent, editable), English (en-IN) / Hindi (hi-IN) / Hinglish (en-IN, editable) selector, handled errors: denied permission, unsupported browser/language, no speech, no mic, network, empty transcript. A note explains that some browsers process dictation audio in their own speech service; CampusSphere records and uploads nothing.
- Voice output: per-reply "Read aloud"/"Stop reading" via `speechSynthesis`, cancels before starting another (no overlap), optional auto-read setting stored in localStorage (try/catch), code blocks are replaced by a short spoken note, hidden when unsupported.
- Labs hub now links the Bootstrap demo and states that Q01–Q41 standalone pages are **pending** (original wording unavailable). **No standalone question pages were created.**
- Bootstrap 5.3.3 is vendored locally at `frontend/vendor/bootstrap-5.3.3/` (verified present with LICENSE); only `pages/bootstrap-demo.html` loads it, from local paths, no CDN; landing page and shared CSS do not.
- Nav: nine links collapse to the hamburger below 1180px (was 860px) so they never wrap; layout above 1180px is unchanged.

Verified (actually run)
- `npm test`: smoke, rules, auth, rate-limit, campus, services, ai (stubbed provider), privacy and the new **frontend** suite (assistant helpers: code-block splitting, speech text, bounded history, provider-free error text, length limit; every local href/src in every page resolves; Bootstrap files exist, only the demo page loads them, no CDN, landing/shared CSS clean) all passed.
- Browser, real server: signed-out users see the gate and disabled composer; with the server's actual upstream failing, the UI shows the generic error with Retry and **no assistant message**; real microphone permission was blocked by the pane and the UI showed the correct message.
- Browser, STUBBED chat endpoint (not a real AI reply): Enter sends, Shift+Enter does not; history grows 0→2→…; code block rendering; typing indicator and busy state; duplicate submit blocked; 429 and 502 error states; Retry reuses the same message without duplicating; over-length block; New vs Clear.
- Browser, SIMULATED recognizer and synthesis (not real audio): dictation fills the box without sending, appends to existing text, stop, Hindi language code, empty transcript, no-speech and unsupported-language messages; read aloud/stop/cancel-before-next and auto-read persistence.
- Not run: real dictation or speech output on any device/browser, any real AI reply, touch devices, screen readers, other browsers.

Important finding: this machine has a `GROQ_API_KEY` set as a Windows user environment variable, so the dev server uses it even though `backend/.env` has none. A direct request from this machine to the provider timed out at connect (network/firewall), so no real reply could be obtained here. Verify from a network that can reach the provider; check `GROQ_MODEL` against the provider's current models if you get a model error.
Next: Prompt 7 (full audit, tests, docs, deployment prep). Standalone question pages remain blocked on the question text.

## Prompt 7 — Final audit, integration, docs, deployment prep: DONE (coursework mapping BLOCKED)
Audit findings fixed
- Removed the "coming soon" module shell (`modules.js`, `/api/modules`, `module.html`, `module.js`); about, contact, privacy and terms are now real, honest static pages (no invented contact details).
- Added security headers + CSP (`middleware/securityHeaders.js`); moved the only inline script (Bootstrap demo) to `js/bootstrap-demo.js` so the CSP can forbid inline scripts; verified no CSP violations on landing, events, assistant, privacy and Bootstrap pages.
- `prisma` moved to production dependencies (needed for `migrate deploy` on hosts); production start now fails fast without `DATABASE_URL`/`JWT_SECRET`; dev warns if `DATABASE_URL` is missing.
- Added `frontend/js/config.js` (`apiBase`) as the single frontend setting; `.gitignore` hardened for env files and keys.
- Docs created/updated: `README.md`, `ARCHITECTURE.md`, `COURSEWORK_COVERAGE.md`, `SCREENSHOT_CHECKLIST.md`, `frontend/README.md`, `frontend/DESIGN_SYSTEM.md` (old README design notes), `backend/README.md`; deployment templates `backend/render.yaml`, `frontend/vercel.json` (both untested).

Verified (actually run)
- `npm test`: all 10 suites passed (smoke, rules, auth, rate-limit, campus, services, ai[stubbed provider], privacy, frontend, security incl. headers, CORS, 401 on all 21 private endpoint shapes, production-config failures, Secure cookies in production, syntax check of 67 JS files).
- Migrations: `prisma migrate deploy` on a brand-new empty database applied all 3 migrations; `migrate status` up to date; `migrate diff` against the schema reported no drift; the throwaway database was dropped.
- Landing page: `index.html`, `main.css`, `tokens.css`, `base.css`, `main.js`, `content.js` are byte-identical to the original commit; only shared nav/footer pieces changed (nav links, hamburger breakpoint 860→1180px).
- Secret scan: no `gsk_`-style key in any tracked or non-ignored untracked file; only `backend/.env.example` is an env file in the tree.
- Not run / could not be run: a real AI reply (provider unreachable from this machine), real voice, any deployment, any hosted-database migration, automated DOM/browser tests, screen-reader and cross-browser checks, load tests.

Coursework Q01–Q41: all 41 are `NEEDS ORIGINAL SPECIFICATION`; none is claimed implemented or tested.

## Platform audit, repair and upgrade: DONE (not committed)

Brief: "Critical product audit, functionality repair & premium platform upgrade". Details in FUNCTIONALITY_AUDIT.md and INTERACTION_VERIFICATION.md.

Implemented
- Six-role RBAC with server-side permissions, object-level checks, audit log, session revocation on role/status change.
- Collapsible sidebar shell; 35 page modules; event registration and organizer tools; trip planner; resources with service-request workflow;
  healthcare scheduling; leave approvals; notifications; role-aware dashboard; admin content management; six games with leaderboards.
- AI Assistant root cause fixed (retired default model hidden by a generic error; IPv6/DNS stalls); permission-scoped grounding.
- Landing copy corrected to match real features; placeholders replaced or labelled.

Verified (actually run)
- `npm test`: all 16 suites passed in the final full run. Security suite syntax-checks 127 JS files.
- Browser (in-app pane): shell, wizards for events/requests/leave/healthcare, trip creation, all six games, admin screens.

Not verified / not done
- Real microphone dictation and speech synthesis; real screenshots; DOM-level automated tests; deployment templates.
- Library borrowing; mail/SMS; maps/prices; destination photography.
- Coursework Q01–Q41: question wording still unavailable.
