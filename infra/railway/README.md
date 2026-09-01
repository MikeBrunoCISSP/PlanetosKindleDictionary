# Deploying to Railway

This is the operator runbook. The repository ships everything that can live in
source control — the Fastify service serves the built SPA from one origin, a
`build:railway` script, and the whole project graph in
[`.railway/railway.ts`](../../.railway/railway.ts). What's left is the account,
the GitHub connection, secret values, and a domain. That's this document.

**Topology** (see `openspec/specs/deployment/railway`):

| Service | Public? | Process | Notes |
|---|---|---|---|
| `app` | ✅ (one public origin) | `node apps/api/dist/index.js` | Fastify API **and** the built SPA. `/api/*`, `/admin/jobs`, `/health` are the API; everything else is the SPA. |
| `worker` | ❌ private | `node apps/api/dist/worker.js` | BullMQ dictionary-build + maintenance workers + the hourly sweep. |
| `postgres` | ❌ private | managed | `DATABASE_URL` |
| `redis` | ❌ private | managed | `REDIS_URL` — sessions, queues, rate-limit |
| `dictionaries` (bucket) | ❌ private | S3-compatible | generated EPUB + source-zip artifacts |

Everything runs on Railway. The **only** external dependency is SMTP —
Railway has no managed email service (see `SMTP_URL` below).

---

## 1. Prerequisites

1. A Railway account and workspace — <https://railway.com>.
2. The Railway CLI:
   ```bash
   bash <(curl -fsSL https://railway.com/install.sh)   # macOS / Linux / WSL
   npm i -g @railway/cli                                # any platform, Node ≥ 16
   railway login
   ```
3. This repository pushed to GitHub (`MikeBrunoCISSP/PlanetosKindleDictionary`,
   branch `main`). Railway builds from the connected repo — no Docker image
   required (Railpack builds from source).

---

## 2. Create and link the project

```bash
railway init --name planetos-kindle-dictionary     # creates + links
railway status --json                              # confirm the linked context
```

---

## 3. Apply the infrastructure as code

`.railway/railway.ts` declares the `app` and `worker` services, Postgres, Redis,
and the bucket, plus all variable wiring. Review before applying:

```bash
railway config plan          # Terraform-style diff; expect: 5 to add, 0 to change, 0 to destroy
railway config apply         # operator-approved; do NOT use --yes --confirm-destructive blindly
```

The plan should add exactly: `postgres`, `redis`, `dictionaries` (bucket),
`app`, `worker`. Every secret shows as `preserve()` / redacted — there are no
secret literals in source.

> First-apply ordering: the `app` service's pre-deploy step runs
> `prisma migrate deploy`, which needs Postgres to exist. `apply` provisions
> Postgres first, but if the very first `app` deploy races ahead, just
> `railway redeploy --service app` once Postgres is healthy.

---

## 4. Attach a public domain to `app`

```bash
railway domain --service app --json          # generates <name>-<hash>.up.railway.app
```

`PUBLIC_BASE_URL` is already wired to `https://${{RAILWAY_PUBLIC_DOMAIN}}` in the
IaC, so once the domain exists a redeploy picks it up. For a **custom domain**,
see §9.

---

## 5. Set the operator secrets

These are declared `preserve()` in the IaC — Railway never fills them in. Set
them on **both** `app` and `worker` where noted.

| Variable | Services | How to produce it |
|---|---|---|
| `SESSION_SECRET` | `app` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` — ≥ 32 chars, random, secret. |
| `SETTINGS_ENCRYPTION_KEY` | `app`, `worker` | same generator. ≥ 32 chars. Encrypts the admin-set Turnstile secret at rest — **must be identical on both services** and must never change after data is written. |
| `SMTP_URL` | `app` | `smtp://user:pass@host:port` from an email provider — Railway has none. Options: [Resend](https://resend.com), [Postmark](https://postmarkapp.com), [Amazon SES](https://aws.amazon.com/ses/), [Mailgun](https://mailgun.com). Percent-encode `@ : /` in the user/pass. |
| `ADMIN_EMAIL` | `app` | The email address for the seeded administrator account. |
| `ADMIN_PASSWORD` | `app` | ≥ 8 chars, ≥ 1 uppercase, ≥ 1 lowercase, ≥ 1 digit. Used once by the seed (§7); rotate afterwards from the app. |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" \
  | railway variable set SESSION_SECRET --stdin --service app

node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" > /tmp/sek
railway variable set SETTINGS_ENCRYPTION_KEY --stdin --service app   < /tmp/sek
railway variable set SETTINGS_ENCRYPTION_KEY --stdin --service worker < /tmp/sek
rm /tmp/sek

railway variable set SMTP_URL='smtp://…' ADMIN_EMAIL='you@example.com' --service app
printf '%s' 'YourStrongPassw0rd' | railway variable set ADMIN_PASSWORD --stdin --service app
```

---

## 6. Wire the bucket credentials

Railway bucket credentials are not exposed through the IaC graph, so set the
five `S3_*` variables by hand (they're `preserve()` in the IaC). On **both**
services:

```bash
railway bucket credentials --bucket dictionaries --json
# → { endpoint, accessKeyId, secretAccessKey, bucketName, region, urlStyle }

for svc in app worker; do
  railway variable set \
    S3_ENDPOINT='<endpoint>' \
    S3_BUCKET='<bucketName>' \
    S3_REGION='<region>' \
    S3_ACCESS_KEY_ID='<accessKeyId>' \
    S3_SECRET_ACCESS_KEY='<secretAccessKey>' \
    --service "$svc"
done
```

`S3_ENDPOINT` being set makes the app use path-style addressing, which is what
Railway's S3 gateway expects.

---

## 7. First deploy: migrations and seed

- **Migrations run automatically.** Each `app` deploy runs
  `prisma migrate deploy` as its pre-deploy step, before the new version
  serves traffic. A failed migration fails the deploy and leaves the previous
  version live.
- **Seed the administrator once:**
  ```bash
  railway run --service app pnpm --filter @planetos/api seed
  ```
  Idempotent (an upsert) — safe to re-run to reset the admin password after
  changing `ADMIN_PASSWORD`.

---

## 8. Configure Turnstile (in-app, after deploy)

Cloudflare Turnstile is **not** a deployment variable. Once the app is up, an
administrator sets it in the UI:

1. Sign in as the seeded admin → **Administration → Turnstile**.
2. Enter the Site Key and Secret Key from the Cloudflare dashboard, enable it,
   and run **Test Configuration**.

The Secret Key is stored encrypted with `SETTINGS_ENCRYPTION_KEY` (§5) — which
is why that value must match on `app` and `worker` and must not change.

---

## 9. Custom domain (optional)

```bash
railway domain your-domain.example.com --service app --json
```

Add the returned routing + `TXT` verification records at your DNS provider
(propagation up to 72 h; `404` until the `TXT` verifies). Then point the app at
the custom origin:

```bash
railway variable set PUBLIC_BASE_URL='https://your-domain.example.com' --service app
```

This overrides the `${{RAILWAY_PUBLIC_DOMAIN}}` default. Redeploy so email links
and the CORS origin pick it up.

---

## 10. Day-two operations

| Task | Command |
|---|---|
| Deploy | push to `main` — `app` and `worker` rebuild automatically (scoped by their watch paths). |
| Manual redeploy | `railway redeploy --service app --yes` |
| Roll back | `railway deployment list --service app --json`, then redeploy the previous good deployment, or disconnect auto-deploy. |
| Logs | `railway logs --service app --lines 200` · `--build` for build logs |
| One-off command | `railway run --service app <cmd>` |
| Change infra | edit `.railway/railway.ts` → `railway config plan` → `railway config apply` |

### Acceptance checks (run after the first green deploy)

1. `curl -I https://<app-domain>/` → `200` `text/html` (the SPA).
2. `curl https://<app-domain>/health` → `{"status":"ok"}`.
3. `curl -I https://<app-domain>/login` → `200` HTML (client-side route via the SPA fallback).
4. `curl -s https://<app-domain>/api/does-not-exist` → `application/problem+json`, **not** HTML.
5. In a browser: log in, reload a deep link (e.g. `/entries/…`), confirm the
   session persists across `/api` calls.
6. `railway logs --service worker` shows `dictionary-build and maintenance workers started`
   and exactly one `sweep-changed-series` scheduler.
7. Force a rebuild of a series and confirm the EPUB downloads from the bucket.

---

## 11. Fallback: deploy from a Docker image

Preferred path is GitHub (above). If you must ship pre-built images instead:

1. Build and push images for the API (used for both services — same image,
   different start command) to a registry Railway can read.
2. In `.railway/railway.ts`, swap `source: github(REPO, …)` for
   `source: image("registry/planetos-api:<tag>")` on `app` and `worker`, drop
   `build`, and keep `start` / `preDeploy` / `env`.
3. `railway config plan` → `railway config apply`.

Everything else in this runbook is unchanged.

---

## Variable reference

**Platform-provided** (set automatically — do not set by hand):

| Variable | Source |
|---|---|
| `DATABASE_URL` | `postgres` service (wired in IaC) |
| `REDIS_URL` | `redis` service (wired in IaC) |
| `PORT` | Railway runtime (the app listens on it) |
| `RAILWAY_PUBLIC_DOMAIN` | Railway, once a domain is attached (feeds `PUBLIC_BASE_URL`) |
| `NODE_ENV` | `production` (literal in IaC) |
| `RAILPACK_NODE_VERSION` | `22` (literal in IaC — pins the builder's Node) |

**Operator-set:**

| Variable | Services | §  |
|---|---|---|
| `SESSION_SECRET` | `app` | 5 |
| `SETTINGS_ENCRYPTION_KEY` | `app`, `worker` | 5 |
| `SMTP_URL` | `app` | 5 |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `app` | 5, 7 |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `app`, `worker` | 6 |
| `PUBLIC_BASE_URL` | `app` | only to override the default for a custom domain (§9) |

**In-app, post-deploy:** Cloudflare Turnstile Site/Secret keys (§8).

**Local dev only** (from `.env`, never set on Railway): `BUILD_CRON`.
