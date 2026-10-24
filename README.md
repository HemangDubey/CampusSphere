# CampusSphere — Your Smart Campus Companion

A student project for a Front End Design and Testing course: one calm, editorial web app that brings a student
dashboard, campus events, a travel explorer, campus resources, a demonstration healthcare section, employee
records, course and symposium forms, a demonstration checkout, interactive event labs and an AI Assistant together.

> **Honesty note.** Most content is **sample or demonstration data** and is labelled in the UI. Nothing is connected
> to a real university, hospital or payment provider. See [Known limitations](#known-limitations).

## Features and status

| Area | Status |
| --- | --- |
| Landing page, design system | Done (approved design preserved) |
| Register, login, logout, password reset, profile (PostgreSQL, bcrypt, HTTP-only cookie sessions) | Done. Reset emails are **not sent** (no mail provider); in development the link prints to the server console |
| Student dashboard | Done |
| Events (search, filters, details, register/cancel, capacity, my registrations, symposium form) | Done, with demo events |
| Travel explorer (filters, details, saved destinations) | Done, with approximate demo data and no images, maps or booking |
| Campus resources, library, departments, support | Done as sample content. Library borrowing/reservation **not implemented** |
| Healthcare (info, appointment *requests*) | Demonstration only. No real booking, not a medical service |
| Employee management | Done, administrators only |
| Course registration, reusable form validation | Done |
| Checkout | Demonstration only. No gateway, no card data, no transaction ids |
| Mouse events lab, keyboard events lab | Done |
| AI Assistant (chat UI, voice dictation, read aloud) | Built and tested with a **stubbed** provider. A real reply has not been verified (see below) |
| Local Bootstrap demo | Done (`/pages/bootstrap-demo.html`, Bootstrap 5.3.3, no CDN) |
| Standalone coursework pages Q01–Q41 | **Not built**: the original question wording is not available. See [COURSEWORK_COVERAGE.md](COURSEWORK_COVERAGE.md) |

## Architecture and stack

- **Frontend** `frontend/`: plain HTML, CSS and ES-module JavaScript, no framework or build step.
- **Backend** `backend/`: Node.js 18+, Express 4, Prisma 6, PostgreSQL. Serves `/api` and, in development, the frontend files.
- **Auth:** bcrypt password hashes; signed token in an HTTP-only cookie that points at a server-side session row.
- **AI Assistant:** the browser calls `POST /api/ai/chat`; only the backend talks to the AI provider.
- Details: [ARCHITECTURE.md](ARCHITECTURE.md).

```
frontend/   pages, css, js, vendor (Bootstrap 5.3.3)
backend/    src (app, routes, controllers, validators, middleware, services), prisma (schema, migrations, seed), test, scripts
```

## Prerequisites

Node.js 18 or newer, npm, and a PostgreSQL database (Docker for local development, or a hosted one such as Neon).

## Install and run locally

```bash
# 1. dependencies
npm run install:all

# 2. a local PostgreSQL (skip if you use a hosted database)
docker run -d --name campussphere-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=campussphere -p 5433:5432 postgres:16-alpine

# 3. configuration
cp backend/.env.example backend/.env
#    edit backend/.env: DATABASE_URL=postgresql://postgres:devpass@localhost:5433/campussphere?schema=public
#    and JWT_SECRET=<output of: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">

# 4. database
cd backend && npx prisma migrate deploy && npm run db:seed && cd ..

# 5. start
npm run dev          # http://localhost:3000
```

Everything (pages and API) is served from `http://localhost:3000`, so no CORS setup is needed in development.

## Environment variables (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Required in production |
| `JWT_SECRET` | 32+ random characters for signing sessions. Required in production (dev uses a random per-process secret) |
| `NODE_ENV` | `production` enables Secure cookies and strict config checks |
| `PORT` | Defaults to 3000 |
| `CORS_ORIGINS` | Comma-separated browser origins allowed cross-origin. Empty = same-origin only |
| `COOKIE_SAMESITE` | `lax` (default). `none` only for a cross-origin frontend over HTTPS |
| `SESSION_DAYS`, `AUTH_RATE_LIMIT_MAX` | Session length and auth attempts per 15 minutes per IP |
| `GROQ_API_KEY` | AI provider key. Server-side only. Empty = the AI Assistant reports "not available" |
| `GROQ_MODEL` | Model id (default `llama-3.3-70b-versatile`; change it if the provider retires it) |
| `AI_TIMEOUT_MS`, `AI_RATE_LIMIT_MAX` | AI request timeout and per-user messages per minute |

Process environment variables win over `backend/.env` (for example a `GROQ_API_KEY` set in your OS). Real secrets
belong only in `backend/.env` or your host's secret store, never in git. The frontend has no secrets; its only
setting is `frontend/js/config.js` (`apiBase`).

## Database

```bash
cd backend
npx prisma migrate dev --name <change>   # create and apply a migration while developing
npx prisma migrate deploy                # apply committed migrations (staging/production, non-destructive)
npm run db:seed                          # demonstration data (safe to re-run)
npm run admin:promote -- user@example.edu  # make a registered user an administrator
```

There is no default admin account. Register normally, then promote that user from a machine that has `DATABASE_URL`.
Never run `prisma migrate reset` against a production database.

## Tests

```bash
npm test      # needs the database; runs 10 backend and frontend suites
```

Suites: smoke (pages, health, errors), validation rule parity (browser vs server), auth, rate limits, campus modules,
healthcare/employees/courses/checkout, AI endpoint (**provider stubbed**), privacy (no provider names or keys in the
frontend or tracked files), frontend checks (assistant helpers, link integrity, Bootstrap isolation) and security
(headers, CORS, anonymous access to every private endpoint, production config failure modes, JS syntax).
There are no automated DOM/browser tests; UI behaviour was verified by hand in a browser (see IMPLEMENTATION_PROGRESS.md).

## Deployment

Recommended: **one Render web service** (serves API and pages from the same origin) plus a **Neon** database.
Nothing has been deployed and no deployment URL exists.

1. Create a Neon project and copy its connection string (with `?sslmode=require`).
2. Create a Render web service from this repo (see `backend/render.yaml`, an untested template): root `backend`,
   build `npm install`, start `npx prisma migrate deploy && node src/server.js`, health check `/api/health`.
3. Set `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (and optionally `GROQ_API_KEY`) in the Render dashboard.
4. Open the service URL, register, then run `npm run admin:promote -- you@example.edu` with `DATABASE_URL` pointing at Neon.
5. Optional split hosting: `frontend/vercel.json` proxies `/api` to the backend so cookies stay first-party (untested template).

Cross-origin (not recommended): set `CORS_ORIGINS` to the frontend origin, `COOKIE_SAMESITE=none`, serve both over
HTTPS, set `frontend/js/config.js` `apiBase`, and allow the API origin in the frontend host's CSP `connect-src`.

## Troubleshooting

- **`DATABASE_URL must be set in production` / `JWT_SECRET must be set`**: add the variable; the server refuses to start without it.
- **500 "Something went wrong" on every database action**: the database is unreachable or migrations are not applied. Run `npx prisma migrate deploy`.
- **`prisma generate` or engine download fails**: check network access, then run `npx prisma generate` in `backend/`.
- **Signed in locally but session lost after deploy**: cookies are `Secure` in production, so use HTTPS; behind a proxy keep one origin or follow the cross-origin notes above.
- **AI Assistant says it is unavailable or could not complete**: check `GROQ_API_KEY` (also in your OS environment), `GROQ_MODEL`, and that the server can reach the provider.
- **Browser blocks scripts or styles after adding a CDN/inline script**: the Content Security Policy (`backend/src/middleware/securityHeaders.js`) only allows same-origin scripts.
- **CORS error**: only needed for cross-origin setups; add the exact origin to `CORS_ORIGINS`.

## Known limitations

- Standalone coursework pages (Q01–Q41) are missing until the original questions are provided.
- No email is sent (password reset links appear only in the dev server console).
- A real AI reply and real voice input/output have not been verified; the provider was unreachable from the development machine.
- Library borrowing, real travel maps/bookings/prices, real healthcare booking and real payments do not exist.
- Replies from the AI Assistant render as plain text with code blocks (no rich markdown).
- No automated browser tests; accessibility was checked by hand only partially (no screen-reader pass).
- Deployment files are untested templates.
