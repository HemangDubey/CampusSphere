# CampusSphere backend

Node.js + Express + Prisma (PostgreSQL). It serves the API under `/api` and, for development and single-service
deployments, the static files in `../frontend`.

```bash
npm install                  # also runs `prisma generate`
cp .env.example .env         # then fill DATABASE_URL and JWT_SECRET (see the root README)
npx prisma migrate deploy    # apply migrations (use `npm run db:migrate` while developing schema changes)
npm run db:seed              # optional demonstration data
npm run dev                  # http://localhost:3000
npm test                     # needs the database from DATABASE_URL
npm run admin:promote -- user@example.edu   # make an already-registered user an administrator
```

Layout: `src/app.js` (middleware and routes), `src/routes`, `src/controllers`, `src/validators`, `src/middleware`,
`src/services/aiService.js` (the only AI provider code), `prisma/` (schema, migrations, seed), `test/`.
