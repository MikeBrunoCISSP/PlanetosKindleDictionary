# Deploying to Railway

This is the step-by-step guide for setting up this project on Railway. Most of
the work is already done in the repository: the API serves the built web app
from one address, there's a `build:railway` script that builds everything,
and the full list of services is described in code at
[`.railway/railway.ts`](../../.railway/railway.ts). What's left for you to do
by hand is: create the Railway account and project, connect GitHub, set a
handful of secret values, and attach a domain. That's what this guide walks
through.

**What gets deployed** (see `openspec/specs/deployment/railway` for the full
behavioral spec):

| Service | Public? | What it runs | Notes |
|---|---|---|---|
| `app` | Yes — one public address | `node apps/api/dist/index.js` | The API **and** the built web app. Paths starting with `/api`, plus `/admin/jobs` and `/health`, are the API; everything else is the web app. |
| `worker` | No — private | `node apps/api/dist/worker.js` | Runs background jobs: building dictionaries, cleanup tasks, and the hourly check for changed dictionaries. |
| `postgres` | No — private | managed by Railway | The database. `DATABASE_URL` |
| `redis` | No — private | managed by Railway | Used for login sessions, background jobs, and rate limiting. `REDIS_URL` |
| `dictionaries` (bucket) | No — private | S3-compatible storage | Where generated dictionary files (EPUB + source zip) are stored. |

Everything above runs on Railway itself. The one thing Railway doesn't
provide is sending email — for that, this app uses
[Brevo](https://www.brevo.com)'s web API (`MAIL_TRANSPORT=brevo-api`), which
works on every Railway plan. See [§5.1](#51-email-brevo) below, and
[`BREVO.md`](../../BREVO.md) at the repo root for the full Brevo setup guide.

---

## 1. Before you start

1. Create a Railway account and workspace at <https://railway.com>. If you
   sign up or log in with GitHub, Railway will prompt you to install its
   GitHub App and choose which repositories it can access — make sure this
   repo (`MikeBrunoCISSP/PlanetosKindleDictionary`) is included, either by
   selecting it directly or by allowing access to all repositories. This is
   what actually lets Railway pull code from GitHub in step 3 below; signing
   in with GitHub on its own doesn't grant repo access by itself.
2. Install the Railway command-line tool:
   ```bash
   bash <(curl -fsSL https://railway.com/install.sh)   # macOS / Linux / WSL
   npm i -g @railway/cli                                # any platform, Node ≥ 16
   railway login
   ```
   `railway login` opens your browser to sign in — if you already created
   your Railway account with GitHub in step 1, just sign in with GitHub here
   too.
3. Make sure this repository is pushed to GitHub
   (`MikeBrunoCISSP/PlanetosKindleDictionary`, branch `main`). Railway builds
   straight from your GitHub repo — you don't need to build or push a Docker
   image yourself.

   **If you didn't grant repo access during signup**, or you're not sure,
   you can check or fix it any time: Railway dashboard → your account/workspace
   settings → **GitHub** → make sure this repo is listed under the connected
   repositories. If it's missing, that page has a link back to GitHub's
   permission screen to add it.

---

## 2. Create and connect the project

```bash
railway init --name ereader-dictionaries           # creates the project and connects this folder to it
railway status --json                              # double-check it connected to the right project
```

---

## 3. Create the services

`.railway/railway.ts` is a file that describes everything this project needs
on Railway: the `app` and `worker` services, the database, Redis, the storage
bucket, and how they're all wired together. Both `app` and `worker` are
already configured in that file to build directly from this GitHub repo and
branch — you don't need to separately connect a repo to each service in the
dashboard; as long as Railway has access to the repo (§1), applying this
config points both services at it automatically. Before creating anything,
you can preview what will happen:

```bash
railway config plan          # shows what would be created/changed; expect "5 to add, 0 to change, 0 to destroy"
railway config apply         # actually creates them — review the plan output first, don't apply blindly
```

The plan should show exactly 5 new things: `postgres`, `redis`, the
`dictionaries` bucket, `app`, and `worker`. Any secret values show up as
hidden/placeholder text — none of them are stored in the source code.

> **Note on the very first deploy:** the `app` service runs a database-setup
> step before it starts. That step needs Postgres to already exist. Railway
> normally creates Postgres first, but if `app`'s first deploy happens to
> start before Postgres is ready, just run `railway redeploy --service app`
> again once Postgres shows as healthy.

---

## 4. Give `app` a public web address

```bash
railway domain --service app --json          # generates something like <name>-<hash>.up.railway.app
```

The app is already set up to automatically use whatever address Railway
gives it, so the next deploy will pick this up on its own. If you want to use
your own domain name instead, see [§9](#9-custom-domain-optional).

### 4.1 How the app knows a request is real

The app needs to know the real IP address of whoever is making a request —
this is used for rate limiting (stopping abuse) and for verifying Cloudflare
Turnstile (the "prove you're not a robot" check). It does this by trusting
exactly one network hop back from where the request arrives
(`TRUST_PROXY_HOPS`, default `1`). This is correct as long as Railway's own
network edge is the *only* way to reach the app — which is how Railway works
today, with no extra load balancer in between.

**This isn't something the app can verify on its own** — it's an assumption
based on how Railway currently works, not something checked automatically.
If you want to sanity-check it yourself: after deploying, run
`railway logs --service app` and confirm the IP addresses in the logs look
like real visitor IPs, not Railway's own internal address. If Railway ever
changes its network setup to add another hop in front of the app (for
example, adding a CDN), you'd need to set `TRUST_PROXY_HOPS=2` on `app` and
redeploy — nothing will warn you if this changes. (`worker` doesn't accept
web requests, so none of this applies to it.)

### 4.2 How Railway knows the app is actually working

Railway checks `/health` on `app` to decide whether a deploy is actually
ready to receive traffic. This endpoint doesn't just check that the process
started — it actually checks that the database and Redis are reachable
(each with a roughly 1.5-second limit) and returns an error status if either
one isn't. That way, a broken deploy never starts receiving real traffic. To
avoid overloading the database with these checks, a recent result may be
reused for a couple of seconds. This check does not include the file-storage
bucket, since the app doesn't actually need to reach storage to serve most
requests.

`worker` doesn't accept web requests, so Railway has nothing to check there.
Instead, before `worker` starts processing any background jobs, it checks on
its own that the database, Redis, and the storage bucket are all reachable —
retrying for a few seconds in case one of them is just slow to start up. If
something is still unreachable after those retries, `worker` shuts itself
down rather than trying to process jobs it can't actually finish. If a
dependency stays broken for longer than that, Railway's normal
restart-on-crash behavior is what eventually recovers it — there's no extra
retry logic beyond that first startup check.

---

## 5. Set the secret values

These values are never filled in automatically — you need to set them
yourself. Some need to be set on both `app` and `worker`, as noted.

| Variable | Which service(s) | How to get a value |
|---|---|---|
| `SESSION_SECRET` | `app` | Generate a random string: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Must be at least 32 characters and kept secret. |
| `SETTINGS_ENCRYPTION_KEY` | `app` **and** `worker` | Same command as above. Used to encrypt the Cloudflare Turnstile secret when an admin saves it — **must be the exact same value on both services**, and must never change once it's set (changing it would make already-encrypted data unreadable). |
| `ADMIN_EMAIL` | `app` | The email address for the built-in administrator account. |
| `ADMIN_PASSWORD` | `app` | At least 8 characters, with at least one uppercase letter, one lowercase letter, and one digit. Used once when you create the admin account (§7) — you can change it afterward from within the app. |

Email-related values are covered separately in [§5.1](#51-email-brevo).

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" \
  | railway variable set SESSION_SECRET --stdin --service app

node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" > /tmp/sek
railway variable set SETTINGS_ENCRYPTION_KEY --stdin --service app   < /tmp/sek
railway variable set SETTINGS_ENCRYPTION_KEY --stdin --service worker < /tmp/sek
rm /tmp/sek

railway variable set ADMIN_EMAIL='you@example.com' --service app
printf '%s' 'YourStrongPassw0rd' | railway variable set ADMIN_PASSWORD --stdin --service app
```

### 5.1 Email (Brevo)

The app sends email (account verification, password reset, and
account-approved notices) through [Brevo](https://www.brevo.com)'s web API.
This is already configured in `.railway/railway.ts`
(`MAIL_TRANSPORT=brevo-api`) and works on every Railway plan — you don't need
a paid plan just to send email.

1. **Verify a sending domain in Brevo.** In the Brevo dashboard, go to
   *Senders, Domains & Dedicated IPs* and add the domain your emails will
   come from (e.g. `mail.yourdomain.com`). Add the DNS records Brevo shows
   you, then wait for it to show as verified. Email sent from an unverified
   domain will be rejected.
2. **Create an API key.** In the Brevo dashboard, go to *SMTP & API* → *API
   Keys* and generate one. Make sure it's an **API key**, not an SMTP key —
   they look similar but aren't interchangeable.
3. **Set the values on both `app` and `worker`** — the worker is what
   actually sends mail (it processes the email queue), not the API, so both
   need these:

   ```bash
   for svc in app worker; do
     printf '%s' 'xkeysib-…' | railway variable set BREVO_API_KEY --stdin --service "$svc"
     railway variable set \
       MAIL_FROM_ADDRESS='no-reply@mail.yourdomain.com' \
       MAIL_FROM_NAME='eReader Dictionaries' \
       --service "$svc"
   done
   ```

   `MAIL_FROM_ADDRESS` has to be on the domain you verified above — both
   services refuse to start if it looks like a local/test address
   (`localhost`, `.local`, `.test`, `.example`).

> **Using a paid Railway plan instead?** If you're on a Railway plan that
> allows outbound email (SMTP), you can use that instead of the web API:
> change `MAIL_TRANSPORT` to `"smtp"` in `.railway/railway.ts` and set
> `SMTP_URL='smtp://<brevo-login>:<brevo-SMTP-key>@smtp-relay.brevo.com:587'`
> on the `app` service (this uses an **SMTP key**, generated under *SMTP &
> API* → *SMTP* — a different credential from the API key above).
> `BREVO_API_KEY` is unused in this case.

**After deploying, test it:** register a test account, use *Forgot
password*, and approve a pending registration. Then check the Brevo
dashboard under *Transactional* → *Logs* to confirm all three emails show up,
sent from your `MAIL_FROM_ADDRESS`.

See [`BREVO.md`](../../BREVO.md) for a more detailed walkthrough, including
what to do if something goes wrong.

---

## 6. Connect the storage bucket

Railway doesn't expose the bucket's connection details automatically, so
you'll need to fetch and set them yourself. These go on **both** services:

```bash
railway bucket credentials --bucket dictionaries --json
# → returns { endpoint, accessKeyId, secretAccessKey, bucketName, region, urlStyle }

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

---

## 7. First deploy: setting up the database

- **The database schema updates itself automatically, on every deploy of
  both services.** Before `app` or `worker` starts running, it applies any
  pending database changes. This is safe to run from both services at the
  same time — whichever one gets there first does the actual work, and the
  other one just sees there's nothing left to do. If a database update
  fails, only that service's deploy fails, and the previous working version
  keeps running.
- **Create the administrator account once:**
  ```bash
  railway run --service app pnpm --filter @planetos/api seed
  ```
  This is safe to run more than once — if the admin account already exists,
  it just updates it. That means you can also re-run this later if you want
  to reset the admin password after changing `ADMIN_PASSWORD`.

### 7.1 Writing database changes that don't break things

`app` and `worker` each deploy on their own schedule, not at exactly the same
moment — so for a little while after you push a change, one service might be
running new code against the old database structure while the other hasn't
updated yet. If a database change removes something the not-yet-updated
service still expects to be there, that service will break the instant the
change applies, even though its own code hasn't changed.

- **Split the change across two deploys** if you're removing or renaming a
  column, dropping a table, or removing something else that existing code
  might still use. First, ship a plain code change that makes sure nothing
  reads the old thing anymore. Only after that's live should you ship the
  actual database change that removes it. Example: to remove
  `Entry.legacyNote`, first deploy code that no longer reads that field
  anywhere, then in a later deploy, remove the column itself.
- **You don't need to split anything** for purely additive changes — adding
  a new optional column, a new table, or a new index. Example: adding
  `Entry.reviewedAt DateTime?` can go out in the same deploy as the code that
  starts using it, since old code simply ignores a column it doesn't know
  about.

### 7.2 Rolling back and backups

**Rolling back undoes code, not database changes.** Re-deploying an older
version of the app (§10) puts the old code back, but it does **not** undo
any database change that already happened — there's no automatic way to
"undo" a database migration. If a bad deploy included a database change,
rolling the code back still leaves that change in place. To truly go back,
you'd need to restore from a backup (below) or write a new migration that
manually reverses it.

**Take a backup before deploying anything that changes the database
structure** — especially if it removes or renames something (§7.1):

1. **Turn on regular backups** — in the Railway dashboard, go to the
   `postgres` service → *Backups* tab → enable Daily (kept 6 days), Weekly
   (kept 27 days), and/or Monthly (kept 89 days). You can enable more than
   one at once.
2. **Take a backup right before a risky deploy** — same *Backups* tab, click
   to create an on-demand backup, and wait for it to finish before deploying.
3. **Restoring a backup** — same tab, pick the backup by date, and click
   *Restore*. Railway restores it as a separate copy first rather than
   overwriting your current database outright, so you don't lose the
   pre-restore data by mistake.

---

## 8. Set up Turnstile (after deploying, inside the app)

Cloudflare Turnstile (a "prove you're not a robot" check) isn't set with a
Railway variable — it's configured inside the app itself, after it's
running:

1. Sign in as the administrator account you created → go to
   **Administration → Turnstile**.
2. Enter the Site Key and Secret Key from your Cloudflare dashboard, turn it
   on, and click **Test Configuration**.

The Secret Key is stored encrypted using `SETTINGS_ENCRYPTION_KEY` (§5) —
which is exactly why that value has to match on both `app` and `worker`, and
must never change afterward.

---

## 9. Custom domain (optional)

```bash
railway domain your-domain.example.com --service app --json
```

Add the DNS records this command gives you at your domain registrar
(this can take up to 72 hours to take effect; the site will show a 404 error
until the verification record is confirmed). Then tell the app to use your
domain:

```bash
railway variable set PUBLIC_BASE_URL='https://your-domain.example.com' --service app
```

This replaces the default Railway-provided address. Redeploy afterward so
email links and cross-origin checks pick up the new domain.

---

## 10. Everyday operations

| Task | Command |
|---|---|
| Deploy a change | Push to `main` — `app` and `worker` rebuild automatically, but only if you changed files relevant to that service. |
| Manually redeploy | `railway redeploy --service app --yes` |
| Roll back to an older version | `railway deployment list --service app --json`, then redeploy an earlier one from the list, or turn off auto-deploy. This only reverts code — see §7.2 for what it doesn't undo. |
| View logs | `railway logs --service app --lines 200` (add `--build` for build logs instead) |
| Run a one-off command | `railway run --service app <command>` |
| Change infrastructure | Edit `.railway/railway.ts`, then `railway config plan` to preview, then `railway config apply` to apply it. |

### Checklist after your first successful deploy

1. `curl -I https://<app-domain>/` → should return `200` and `text/html` (the web app's homepage).
2. `curl https://<app-domain>/health` → should return `200` with something like
   `{"status":"ok","checks":{"postgres":{"ok":true},"redis":{"ok":true}}}`.
   A `503` here means the database or Redis is actually unreachable — see §4.2.
3. `curl -I https://<app-domain>/login` → should return `200` with HTML (a page within the web app, loaded directly).
4. `curl -s https://<app-domain>/api/does-not-exist` → should return an error in JSON format, **not** an HTML page.
5. In a browser: log in, refresh the page on a specific item (e.g. `/entries/…`), and confirm you're still logged in afterward.
6. `railway logs --service worker` should show a line like
   `dictionary-build, maintenance, and email workers started`, and exactly
   one line about the recurring dictionary-check schedule being registered.
7. Trigger a rebuild of a dictionary and confirm the resulting file downloads correctly from storage.

---

## 11. Alternative: deploying from a pre-built Docker image

The preferred approach is deploying straight from GitHub, as described
above. If you need to deploy from a pre-built image instead:

1. Build an image (the same image works for both `app` and `worker` — they
   just run different start commands) and push it somewhere Railway can pull
   from.
2. In `.railway/railway.ts`, replace `source: github(REPO, …)` with
   `source: image("registry/planetos-api:<tag>")` for both `app` and
   `worker`. Remove the `build` section, but keep `start`, `preDeploy`, and
   `env` as they are.
3. Run `railway config plan`, then `railway config apply`.

Everything else in this guide still applies.

---

## Reference: all environment variables

**Set automatically — you don't need to set these yourself:**

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | The `postgres` service |
| `REDIS_URL` | The `redis` service |
| `PORT` | Set by Railway at runtime; the app listens on whatever port it provides |
| `RAILWAY_PUBLIC_DOMAIN` | Set by Railway once a domain is attached (used to build `PUBLIC_BASE_URL`) |
| `NODE_ENV` | Always `production` |
| `RAILPACK_NODE_VERSION` | `22` — pins the Node.js version used to build the app |
| `MAIL_TRANSPORT` | `brevo-api` by default; change to `smtp` if using the paid-plan SMTP relay instead |

**You need to set these yourself:**

| Variable | Which service(s) | Where to read about it |
|---|---|---|
| `SESSION_SECRET` | `app` | §5 |
| `SETTINGS_ENCRYPTION_KEY` | `app`, `worker` | §5 |
| `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | `app`, `worker` | §5.1 — the worker is what actually sends mail |
| `SMTP_URL` | `app`, `worker` | §5.1 — only needed if `MAIL_TRANSPORT=smtp` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `app` | §5, §7 |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `app`, `worker` | §6 |
| `PUBLIC_BASE_URL` | `app` | Only needed to override the default if you set up a custom domain (§9) |
| `TRUST_PROXY_HOPS` | `app` | §4.1 — defaults to `1`; you'd only ever change this if Railway's network setup changes |

**Set inside the app itself, after deploying:** Cloudflare Turnstile Site Key
and Secret Key (§8).

**Local development only** (from your `.env` file — never set this on
Railway): `BUILD_CRON`.
