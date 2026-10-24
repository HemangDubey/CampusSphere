# CampusSphere architecture

## Responsibilities

| Layer | Responsibility |
| --- | --- |
| `frontend/` | Presentation and input handling. Validates for usability, calls the API, renders results. Holds no secrets and makes no authorization decisions |
| `backend/` | Authentication, authorization, validation, business rules (capacity, ownership, prices), persistence, and the only contact with the AI provider |
| PostgreSQL | System of record, accessed only through Prisma |

## Request flow

```
Browser page (ES modules)
  -> js/api.js  request('/events', ...)   fetch /api/..., credentials included, 15 s timeout
  -> Express app.js
       securityHeaders -> cors -> json (100 kb) -> cookieParser -> checkOrigin (CSRF defence for writes)
       -> routes/*  ->  [optionalAuth | requireAuth | requireRole] -> [rate limiter] -> controller
       -> validators/rules.js -> Prisma -> JSON envelope
  -> errorHandler  (one place; generic messages, no stack traces to clients)
```

Every API response uses one envelope: `{ success: true, data, message? }` or
`{ success: false, error: { code, message, details? } }`. `details` maps field names to messages for validation errors.

## Authentication and authorization

- Registration/login hash with bcrypt (12 rounds). Login returns the same error for a wrong password and an unknown email.
- A successful login creates a `Session` row and sets an HTTP-only, SameSite cookie containing a signed token with the
  session id. Each request loads the session; logout and password reset revoke rows, so stolen cookies stop working server-side.
- Roles: `STUDENT` (default), `FACULTY`, `EVENT_ORGANIZER`, `HEALTHCARE_ADMIN`, `CAMPUS_ADMIN`, `SUPER_ADMIN`. `permissions.js` maps role to permissions (`event:manage`, `leave:review`, `request:review`, `healthcare:manage`, `resource:manage`, `content:manage`, `employee:manage`, `user:manage`, `audit:view`, `report:view`); `requirePermission` guards routes and controllers add object-level checks (ownership, organizer of the event, no self-review). Registration always yields STUDENT; roles change only via `admin:promote` or a Super Admin, which revokes the user's sessions and writes an audit entry.
- Ownership rules are enforced in queries (`where userId = req.user.id`): registrations, favourites, appointment requests, course registrations.
- Employee records require `ADMIN` in middleware, independent of the UI.
- Writes with a foreign `Origin` header are rejected (cookie CSRF defence); CORS allows only `CORS_ORIGINS`.
- Rate limits: auth endpoints per IP; AI endpoint per signed-in user.

## Database (Prisma, `backend/prisma/schema.prisma`)

`User` 1—* `Session`, `PasswordResetToken` (stores only a SHA-256 hash, single use, 30-minute expiry),
`EventRegistration`, `FavoriteDestination`, `Appointment`, `CourseRegistration`.
Platform tables: `Trip`/`TripItem`/`TripMember`, `ResourceBookmark`, `ReadingListItem`, `ServiceRequest`, `LeaveRequest`, `StatusHistory` (shared by the three workflows), `HealthService`/`HealthProvider`/`HealthSlot` with `Appointment` (unique slot), `Notification`, `AuditLog`, `Announcement`, `GameScore`. `Event`, `Destination`, `Resource`, `Employee` stand alone. Unique constraints prevent duplicate registrations and
favourites; event capacity is checked inside a serializable transaction. Seeded rows are flagged `isDemo`.
Four migrations are committed; `migrate deploy` from an empty database reproduces the schema with no drift (verified).

## AI Assistant request flow

1. `/assistant` page collects a message; `aiApi.chat` sends `{ message, history }` (history = last 12 successful turns, role/content only) to `POST /api/ai/chat`.
2. The route requires a session and applies the per-user limit. `validators/ai.js` checks lengths, roles and structure.
3. `services/aiService.js` (the only file that names the provider) adds a server-side system instruction, calls the provider with a timeout, and returns only the reply text.
4. Any failure becomes a generic, provider-independent error code (`AI_UNAVAILABLE`, `AI_BUSY`, `AI_TIMEOUT`, `AI_FAILED`). The key and model come from server environment variables and are never sent to the browser.
5. The UI shows the reply or the error with Retry. It never fabricates a reply. Voice uses the browser's Web Speech APIs only.

## Workflows

Service requests (SUBMITTED, UNDER_REVIEW, INFO_REQUIRED, APPROVED, REJECTED, CANCELLED), leave and appointments are state machines enforced on the server: illegal transitions are refused, decisions need reasons where stated, reviewers cannot decide their own items, and every change writes `StatusHistory`, a `Notification` and (for staff actions) an `AuditLog` row. Appointment slots are claimed with a compare-and-set inside a serializable transaction.

## AI grounding

`services/aiContext.js` builds a compact, permission-scoped summary of the signed-in user's own events, requests, appointments and public catalogue data, which `aiService.js` adds to the system instruction. Other users' data and staff-only data are never included for ordinary roles. Replies return only `{reply}`.

## External services and configuration

PostgreSQL (`DATABASE_URL`), AI provider (`GROQ_API_KEY`, `GROQ_MODEL`), Google Fonts and Unsplash images (landing/travel look; allowed by the CSP). No mail, payment, map or SMS provider is configured.

## Security boundaries

- Secrets live only in server environment variables; a test scans the frontend and tracked files for provider names and key patterns.
- CSP allows same-origin scripts only (no inline scripts), plus the font and image hosts above; frame embedding is denied; `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` are set.
- All dynamic text rendered with `innerHTML` is escaped first (`esc()`); assistant replies are escaped and only fenced code blocks get special rendering.
- Checkout rejects card/CVV-style fields, recomputes totals on the server, and returns no transaction id.
- Healthcare requests never leave the database and do not return the phone number.
- Production start fails fast without `JWT_SECRET` and `DATABASE_URL`; cookies are `Secure` in production.

## Known security limitations

- Reset links are only visible in the server console in development; there is no email delivery.
- Registration reveals whether an email is already registered (409), a deliberate usability trade-off; login does not.
- No account lockout beyond IP rate limiting; no MFA; audit logs exist but are not tamper-proof.
- `style-src` allows `unsafe-inline` because pages use some inline style attributes.
- The deployment templates (`backend/render.yaml`, `frontend/vercel.json`) have not been exercised.
