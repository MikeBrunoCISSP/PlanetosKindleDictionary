# Planetos Kindle Dictionary

## Getting started

### 1. Start infrastructure

```bash
cd infra
docker compose up -d
```

Starts Postgres 16 (`:5432`), Redis 7 (`:6379`), and MinIO (`:9000` / `:9001`). Wait a few seconds for the health checks to pass before continuing.

### 2. Create your `.env`

```bash
cp .env.example .env
```

The defaults in `.env.example` match the docker-compose services. The things you **must** change for local dev:

| Variable | What to set |
|---|---|
| `SESSION_SECRET` | Any string ≥ 32 random characters |
| `ADMIN_EMAIL` | The email address you want to log in with |
| `ADMIN_PASSWORD` | ≥8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit |

Everything else (`DATABASE_URL`, `REDIS_URL`, S3 credentials) matches the docker-compose defaults and works unchanged.

### 3. Install dependencies

```bash
pnpm install
```

### 4. Run migrations

```bash
pnpm --filter api prisma migrate deploy
```

Applies all pending migrations to Postgres. Use `migrate deploy` (not `migrate dev`) so it doesn't generate new migration files.

### 5. Seed the admin account

```bash
pnpm --filter api seed
```

Reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env` and upserts an `ADMIN`-role user. Safe to re-run any time — it's an upsert, so it can also be used to reset the admin password.

### 6. Start the app

```bash
pnpm dev
```

- API: `http://localhost:3000`
- Web: `http://localhost:5173`

Log in at `http://localhost:5173/login` with the credentials from your `.env`.

---

## Re-seeding / resetting the admin password

Edit `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`, then re-run:

```bash
pnpm --filter api seed
```

---

## Production deployment

The app deploys to [Railway](https://railway.com) from GitHub: one public
service runs the API and serves the built SPA from the same origin, a private
service runs the worker, and Railway hosts Postgres, Redis, and the object
storage bucket.

- **Runbook:** [`infra/railway/README.md`](infra/railway/README.md) — account
  setup, `railway config apply`, secrets, first migrate + seed, custom domain.
- **Project graph:** [`.railway/railway.ts`](.railway/railway.ts) — services,
  databases, bucket, and variable wiring as code.
- **Build:** `pnpm run build:railway` builds every package, generates the Prisma
  client, and builds both apps.
