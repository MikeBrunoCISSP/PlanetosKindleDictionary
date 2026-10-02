# Planetos Kindle Dictionary

## Getting started

### 1. Start infrastructure

```bash
cd infra
docker compose up -d
```

Starts Postgres 16 (`:5432`), Redis 7 (`:6379`), MinIO (`:9000` / `:9001`), and Mailpit (`:1025` SMTP / `:8025` web UI). Wait a few seconds for the health checks to pass before continuing.

After first-time setup, use `pnpm dev:up` instead (see [Day-to-day development](#day-to-day-development)). It does this step for you.

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

In production this runs automatically as a Railway pre-deploy step on both
the `app` and `worker` services — no manual command needed there. See
`infra/railway/README.md` §7.

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

## Day-to-day development

Once first-time setup is done, three root scripts cover starting and stopping everything.

| Command | What it does |
|---|---|
| `pnpm dev:up` | Starts the containers if needed, then starts the app |
| `pnpm stop:app` | Stops the app dev servers; leaves the containers running |
| `pnpm stop:containers` | Stops the containers; leaves the app alone |

### Start everything: `pnpm dev:up`

```bash
pnpm dev:up
```

1. Checks that Docker is running. If it isn't, it exits and tells you to start Docker Desktop.
2. Checks every service in `infra/docker-compose.yml`. If they're all running and healthy, it skips straight to the app.
3. Otherwise it runs `docker compose up -d` and waits up to 90 seconds for the containers to become healthy, printing each one's status every 2 seconds.
4. Runs `pnpm run dev`, which builds the shared packages and then starts the web, API, and worker dev servers in watch mode.

It's safe to run at any time. Press `Ctrl+C` to stop the app; the containers keep running.

### Debugging locally

While `pnpm dev:up` is running:

| What | Where |
|---|---|
| Web app (Vite, hot reload) | http://localhost:5173 |
| API (`tsx watch`, restarts on save) | http://localhost:3000 |
| Emails the app sends (Mailpit inbox) | http://localhost:8025 |
| MinIO console (built `.epub` and `sources.zip` files) | http://localhost:9001 |

- The web dev server proxies `/api` to `:3000`, so in the browser, call the API through `:5173` the same way the app does.
- API and worker logs share one terminal, labelled `[api]` (blue) and `[worker]` (magenta).
- Nothing sends real email locally. Verification and password-reset emails land in Mailpit, so open its inbox to click their links.
- If a container won't become healthy, `pnpm dev:up` times out and names it. Check that container's logs with `docker compose -f infra/docker-compose.yml logs <service>`.

### Stop just the app: `pnpm stop:app`

```bash
pnpm stop:app
```

Stops the Vite, `tsx watch`, and `tsc --watch` processes for this repo, along with the `pnpm` and `concurrently` processes wrapping them. It finds them by command line, not PID file. That means it also stops dev servers started by an editor, an agent, or a terminal you've closed.

It only matches processes whose command line contains this repo's path, so dev servers from other projects are left alone. The containers keep running.

### Stop just the containers: `pnpm stop:containers`

```bash
pnpm stop:containers
```

Runs `docker compose stop` on Postgres, Redis, MinIO, and Mailpit. The containers are stopped, not removed, and their volumes are kept, so your database and built dictionary files are still there on the next `pnpm dev:up`.

To stop everything, run both:

```bash
pnpm stop:app
pnpm stop:containers
```

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
