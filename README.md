# CampusSphere 

**Your campus, in one place.** CampusSphere is a full-stack campus platform that brings events, travel planning, campus services, a digital library, student community, healthcare scheduling, leave approvals and an AI assistant into a single role-aware web application.

## Features

| Area | What you can do |
| --- | --- |
| **Dashboard** | A personal overview of upcoming events, open requests, notifications, announcements and role-specific workload. |
| **Events & Symposiums** | Search and filter events, register through a guided form, receive a reference number, cancel, and track registrations. Organizers create, publish and cancel events, manage attendance and export registrations. |
| **Travel Explorer** | Browse destinations by type, budget and duration, save favourites, and build trip plans with day-by-day itineraries, expenses, budget tracking, sharing and collaborators. |
| **Campus Resources** | Departments, facilities and support services with featured, most-saved and recently viewed sections, bookmarks, issue reports and a configurable service-request workflow with status tracking. |
| **Library** | Searchable catalogue with tags and publication details, plus a private reading list with notes, progress, collections, ordering and CSV export. |
| **Student Community** | Discussion feed with topics, comments, likes and saved posts; clubs and project groups with join requests, member management and announcements; reporting and moderation. |
| **Healthcare** | Browse services and providers, book available time slots, reschedule or cancel, and follow appointment status. Staff review and manage schedules. |
| **Leave Requests** | Submit leave to an assigned reviewer, respond to information requests, withdraw, and follow the decision history. |
| **Notifications & Activity** | In-app notifications and a personal activity history generated from real events. |
| **Games & Recreation** | Six playable games with difficulty levels and leaderboards. |
| **AI Assistant** | A chat assistant with voice dictation and read-aloud, grounded in the signed-in user's own campus data. |
| **Administration** | User and role management, role approvals, content and announcement management, request queues, community moderation, reports and an audit log. |

## Roles and access

Access is enforced on the server by permission, with object-level checks on every record.

| Role | Responsibilities |
| --- | --- |
| **Student** | Default role. Uses all everyday features for their own records. |
| **Faculty / Staff** | Reviews assigned leave and service requests. |
| **Event Organizer** | Creates and manages events, registrations and attendance. |
| **Healthcare Admin** | Manages healthcare services, providers, slots and appointments. |
| **Campus Admin** | Manages events, requests, resources, content and employee records; views reports and the audit log; moderates the community. |
| **Super Admin** | Everything above, plus users, roles and role requests. |

New accounts start as students. The registration form lets a person ask for another role; a Super Admin approves or declines the request in **Administration → Users & Roles**.

## Tech stack

- **Frontend:** HTML, CSS and ES-module JavaScript. No framework and no build step.
- **Backend:** Node.js, Express 4, Prisma 6.
- **Database:** PostgreSQL 16.
- **Authentication:** bcrypt password hashes and revocable server-side sessions delivered in an HTTP-only cookie.
- **Security:** Content Security Policy and standard security headers, origin checks on writes, rate limiting on authentication, AI and community writes, input validation on every endpoint.
- **AI:** provider access is isolated in `backend/src/services/aiService.js` and is server-side only.

## Getting started

### Prerequisites

- Node.js 18 or newer
- npm
- PostgreSQL 16 (Docker is the quickest way to run it locally)

### Install and run

```bash
# 1. Install dependencies
npm run install:all

# 2. Start PostgreSQL
docker run -d --name campussphere-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=campussphere -p 5433:5432 postgres:16-alpine

# 3. Configure the backend
cp backend/.env.example backend/.env
#    set DATABASE_URL=postgresql://postgres:devpass@localhost:5433/campussphere?schema=public
#    set JWT_SECRET to a long random string:
#    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Create the schema and load starter content
cd backend
npx prisma migrate deploy
npm run db:seed
cd ..

# 5. Start the app
npm run dev
```

The application, including the API, is served at **http://localhost:3000**.

### Local sign-in accounts

```bash
cd backend
npm run dev:accounts
```

This creates one account for each of the six roles and writes the credentials to `backend/dev-accounts.txt`, which is git-ignored. It refuses to run when `NODE_ENV=production`.

## Configuration

Set these in `backend/.env` (or in your host's secret store).

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Required in production. |
| `JWT_SECRET` | Secret of at least 32 characters used to sign sessions. Required in production. |
| `NODE_ENV` | `production` enables secure cookies and strict configuration checks. |
| `PORT` | Server port. Defaults to `3000`. |
| `CORS_ORIGINS` | Comma-separated list of browser origins allowed cross-origin. Empty means same-origin only. |
| `COOKIE_SAMESITE` | `lax` by default. Use `none` only for a cross-origin frontend served over HTTPS. |
| `SESSION_DAYS` | Session lifetime in days. |
| `AUTH_RATE_LIMIT_MAX` | Authentication attempts allowed per 15 minutes per IP. |
| `COMMUNITY_RATE_LIMIT_MAX` | Community writes allowed per minute per user. |
| `GROQ_API_KEY` | AI provider key. Server-side only. The assistant reports itself as unavailable when empty. |
| `GROQ_MODEL` | AI model identifier. |
| `AI_TIMEOUT_MS` | Timeout for AI requests. |
| `AI_RATE_LIMIT_MAX` | AI messages allowed per minute per user. |

Environment variables set in the operating system take precedence over `backend/.env`. Never commit real secrets.

## Database and content

```bash
cd backend
npx prisma migrate dev --name <change>       # create and apply a migration while developing
npx prisma migrate deploy                    # apply committed migrations (staging and production)
npm run db:seed                              # base content (plus starter content for the role accounts outside production); idempotent
npm run db:seed:activity                     # starter content for the role accounts only
npm run db:seed -- --reset-demo              # remove seeded content, then reseed
npm run admin:promote -- user@example.edu SUPER_ADMIN
```

Seeding only adds what is missing, so it is safe to run repeatedly. Roles for existing users can be set with `admin:promote` (`FACULTY`, `EVENT_ORGANIZER`, `HEALTHCARE_ADMIN`, `CAMPUS_ADMIN`, `SUPER_ADMIN`) or by a Super Admin in the app. Do not run `prisma migrate reset` against a production database.

## Testing

```bash
npm test
```

The suite runs against a real PostgreSQL database and covers authentication, authorization for every role, events, travel, resources and requests, leave, healthcare, administration, community, library, role requests, games, the AI endpoint, privacy, frontend integrity (routes, assets, imports, links) and security (headers, CORS, anonymous access to every private endpoint, JavaScript syntax).

## Project structure

```
frontend/            Pages, styles and ES-module scripts
  css/               Design tokens, components and page styles
  js/pages/          One module per page
  js/games/          Game logic and UI
  img/stock/         Category photography
  pages/             HTML shells for each route
backend/
  src/               Express app, routes, controllers, services, middleware, validators
  prisma/            Schema, migrations and seed scripts
  scripts/           Provisioning and maintenance scripts
  test/              Integration and frontend test suites
```

## API overview

All endpoints live under `/api` and return a consistent JSON envelope:

```json
{ "success": true, "data": {}, "message": "optional" }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```

| Group | Examples |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Events | `GET /events`, `POST /events/:id/register`, `GET /manage/events` |
| Travel | `GET /destinations`, `GET /trips`, `PUT /trips/:id/items` |
| Resources | `GET /resources`, `GET /resources/home`, `POST /service-requests` |
| Library | `GET /reading-list`, `PATCH /reading-list/:id`, `GET /reading-list/export.csv` |
| Community | `GET /community/posts`, `POST /community/groups/:id/join`, `POST /community/reports` |
| Healthcare | `GET /healthcare/services`, `POST /healthcare/appointments` |
| Leave | `POST /leave`, `GET /manage/leave` |
| Administration | `GET /admin/users`, `GET /admin/role-requests`, `GET /admin/audit` |
| AI | `POST /ai/chat` |

## Deployment

CampusSphere runs as a single Node service that serves both the API and the pages, so it needs one web service and one PostgreSQL database.

1. Provision PostgreSQL and copy its connection string.
2. Create a web service with root directory `backend`, build command `npm install`, start command `npx prisma migrate deploy && node src/server.js`, and health check `/api/health`. A starting configuration is provided in `backend/render.yaml`.
3. Set `DATABASE_URL` (use the direct, non-pooled connection string with `sslmode=require`) and, optionally, `GROQ_API_KEY` to enable the AI assistant. `NODE_ENV`, `NODE_VERSION` and a generated `JWT_SECRET` come from the blueprint.
4. Optionally add the base content once, from a machine that has the production `DATABASE_URL`:

   ```bash
   cd backend
   NODE_ENV=production npm run db:seed
   ```

   In production this only adds missing content. It never creates accounts, employee records or activity, and never deletes anything.
5. Register an account, then promote it with `npm run admin:promote -- you@example.edu SUPER_ADMIN` using the production `DATABASE_URL`.

To host the frontend separately, `frontend/vercel.json` proxies `/api` to the backend so cookies stay first-party. For a cross-origin setup, set `CORS_ORIGINS`, `COOKIE_SAMESITE=none`, serve both origins over HTTPS and set `apiBase` in `frontend/js/config.js`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Server exits with `DATABASE_URL must be set` or `JWT_SECRET must be set` | Add the variable. Production refuses to start without both. |
| Every database action returns an error | The database is unreachable or migrations are missing. Run `npx prisma migrate deploy`. |
| `prisma generate` fails with a file-lock error on Windows | Stop the running dev server, then run `npx prisma generate`. |
| Signed in locally but the session is lost after deploying | Cookies are `Secure` in production. Serve over HTTPS and keep one origin. |
| The AI assistant says it is unavailable | Check `GROQ_API_KEY`, `GROQ_MODEL` and outbound network access. |
| A script or style is blocked in the browser | The Content Security Policy allows same-origin scripts only. Add scripts as files, not inline. |

## License

All rights reserved by the repository owner unless a license file states otherwise.
