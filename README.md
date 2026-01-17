# note2tabsWeb

## Setup
1. Copy `.env.example` to `.env` and fill in values.
2. Install dependencies: `npm install`.
3. Run Prisma: `npm run db:generate` (and migrations for your DB).
4. Start: `npm run dev`.

## Required env vars
- `DATABASE_URL` (Prisma)
- `BACKEND_API_BASE_URL` (FastAPI base URL)
- `BACKEND_JWT_SECRET` (shared with FastAPI NOTE2TABS_JWT_SECRET)
- `BACKEND_JWT_ISSUER` + `BACKEND_JWT_AUDIENCE`
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
