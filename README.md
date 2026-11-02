# Garage Desk

Garage Desk is the job book for a small car repair garage in Sofia (1 owner, 3 mechanics). It replaces paper and WhatsApp. Staff log jobs, add labour and parts, and send the customer a private link. The customer opens the link on their phone, reads the quote, and approves or declines it. The same link later shows the repair status. The owner gets a dashboard with workload and this month's revenue.

**Live app:** https://garage-desk-tau.vercel.app (staff sign in at `/login`)

Stack: Next.js 16 (App Router) and TypeScript, Supabase (Postgres and Auth), Tailwind v4, Vitest, Playwright, GitHub Actions, hosted on Vercel.

| Doc | What is in it |
|---|---|
| [docs/PRD.md](docs/PRD.md) | The spec, including the client's answers (§12) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every non-obvious choice and why (D-001 to D-075) |
| [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md) | What to do before and after real use |
| [docs/PLAN.md](docs/PLAN.md), [docs/DESIGN.md](docs/DESIGN.md) | Build plan and design system |

## Who can do what

| | Owner | Mechanic | Customer (link, no login) |
|---|---|---|---|
| Customers and vehicles | Create, edit, search, delete | Create, edit, search | — |
| Jobs | Create for any mechanic, see all, reassign | Create (assigned to themselves), see only their own | Sees only their own job |
| Labour and part lines, quotes | Any job | Their own jobs | Sees the lines, net, VAT and total |
| Customer link | Create, regenerate, revoke | Same, on their own jobs | — |
| Approve the quote | Records a phone approval, with a note | No | Approve, or decline with an optional reason, while the job is Quoted |
| Start, finish, rework, mark collected | Yes | Their own jobs | Sees the current status and a dated timeline |
| Cancel a job | Yes, with a reason (final) | No | — |
| Dashboard and settings | Yes | No ("page not found") | — |

A customer with jobs cannot be deleted (D-062). Sources: PRD §3, D-020, D-051, D-052, D-054.

Job statuses: `New → Quoted → Approved → In progress → Ready → Collected`, plus `Declined` (the customer said no; staff can send a new quote) and `Cancelled` (owner only, final). `Ready → In progress` is rework. Changing the lines of a Quoted, Approved or In progress job creates a new quote version and puts the job back to Quoted.

## Key choices and why

**1. The database is the security boundary.** Row Level Security is on for every table in Supabase Postgres. A mechanic who asks for another mechanic's job, by URL or by API, gets "not found" from the database itself, not only a hidden button. New tables and functions get no default grants, so each one is opened on purpose. (D-002, D-020, D-029, D-038, D-041, D-054)

**2. One function changes job status.** `public.transition_job()` checks the allowed transitions and the caller's role, updates the job and writes exactly one timeline event, all in one transaction. Direct writes to `status` and the money columns are revoked. When lines change on a quoted or approved job, a trigger runs the same logic to make a new quote version. The only exception is the seed script, which writes backdated demo history directly. (D-009, D-016, D-050, D-061)

**3. Money is exact.** Currency is EUR, prices are entered excluding VAT, and times are shown in Europe/Sofia. Unit prices are integer cents. A line amount is stored exactly (`quantity × unit price`, never rounded per line). Job totals come from one database function, `compute_job_totals()`:

- net = round(sum of line amounts)
- VAT = round(sum of line amounts × VAT rate)
- total = net + VAT

Rounding happens once, at the end, half away from zero. Example: 1.25 h × €45.50 plus 0.5 × €12.25 at 20% VAT gives net €63.00, VAT €12.60, total €75.60. Rounding each line first would give a net of €63.01. The UI never adds money up. (D-011, D-048, D-055)

The hourly rate is copied onto each labour line when the line is added. The VAT rate is copied onto each job when the job is created. Changing either in settings never changes an existing line or job. (PRD FR4, D-024, D-072)

**4. The customer is never charged for a total they did not approve.** Each time a job is quoted, the database stores an immutable quote version: net, VAT, total and a copy of every line. An approval names the version the approver saw. If the job has moved on to a newer version, the approval changes nothing. A job can only be started, finished or collected while its current version is the approved one. Extra work after approval creates version 2, and the customer approves again through the same link. Both approvals stay in the timeline. (D-049, D-050, D-059, D-068)

**5. Server-side Next.js with a strict Content Security Policy.** All data access runs in server components and server actions. There is no Supabase client in the browser, and the auth cookies are `httpOnly`. Every page gets a per-request nonce CSP, set in `src/proxy.ts`. Server actions return fixed sentences, never raw database errors. (D-001, D-034, D-043, D-044)

**6. Vercel and Supabase hosting.** Deploys need no servers to manage, and env vars stay outside the repo. Vercel's Hobby tier has no rate-limit rules, so rate limits live in Postgres (D-004, D-012). The Supabase project is in Tokyo (`ap-northeast-1`), so the Vercel functions also run in Tokyo (`hnd1`), next to the database. Users in Sofia pay one long round trip per request. Moving both to Frankfurt is the first infrastructure item in [NEXT-STEPS](docs/NEXT-STEPS.md). (D-066, D-073)

## How the approval link stays safe

The link looks like `https://garage-desk-tau.vercel.app/<token>`. Anyone holding it can see that one job, so it is treated like a password.

- **Long random token.** 32 random bytes from the operating system's secure random generator, written as 43 base64url characters (256 bits). The database stores only its SHA-256 hash. Staff see the full link once, with Copy and "Share via WhatsApp" buttons. The token is never stored in plain form or logged. Job refs such as `GD-0042` and internal IDs open nothing. (D-013, D-036, D-042; `src/lib/tokens.ts`)
- **Only a fixed list of fields.** A database function that only the server can call builds the page data. The app then re-picks the same keys, and tests check the key set. (D-014, D-060; `src/lib/public-job.ts`)
  - Shown: garage name, address and phone; job ref; car make, model and plate; the customer's first name; the quote lines; net, VAT (with its rate) and total; the quote version; the status; a timeline of statuses with dates.
  - Never shown: the customer's phone or email, other cars or jobs, staff names, internal notes, internal IDs. A phone approval reads "Approved by phone (recorded by the garage)". (D-021, D-051)
- **The same 404 for every bad link.** Unknown, tampered and revoked tokens get the same server-rendered "page not found" as any other unknown URL, with the same headers. `src/proxy.ts` decides this before the page renders. The only differences are Next's per-request nonce and the echoed path, which both come from the visitor's own request. (D-019, D-032, D-071)
- **Rate limits.** Counted in Postgres per hashed IP address: 60 page views per minute, 10 approve or decline attempts per minute, 10 sign-in attempts per 5 minutes. Over the view limit you get the same 404. Over the action limit you get "too many attempts". (D-012, D-045; `src/lib/rate-limit.ts`)
- **Approve and Decline work only while the job is Quoted, and only on the version shown.** The page sends back the quote version it displayed. If staff changed the quote in the meantime, or the job is no longer Quoted, nothing changes and the customer is asked to refresh. A double tap is recorded once. The page always shows a frozen quote version, never half-edited lines. (D-049, D-059, D-060; `src/app/[token]/actions.ts`)
- **Staff cannot approve as the customer.** If a signed-in staff member opens the link, Approve and Decline refuse and point to the phone approval on the job page. (D-067)
- **Staff can revoke or regenerate the link.** The owner or the assigned mechanic can revoke it in any status, and create or regenerate it while the job is Quoted, Declined, Approved, In progress or Ready. Regenerating revokes the old link in the same database call. (D-013, D-039, D-053)
- **The link does not expire.** This was the client's decision (PRD §12, question 6). The link shows the current status until staff revoke it. (D-053)
- **No leaks through headers.** Every response carries `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, so search engines skip the page, the token is not sent to other sites, and caches do not keep it. (D-019)

## What was left out on purpose

From PRD §9 and the decisions log:

- Payments, invoices and invoice PDFs.
- Automatic messages. The app sends no SMS, WhatsApp or email. Staff copy the link, or press "Share via WhatsApp", which opens WhatsApp with the message and link filled in.
- Parts inventory and a parts catalogue.
- Appointments and booking.
- A staff management screen. Staff accounts are created by script, and there is no public sign-up.
- More than one garage.
- Offline mode.
- Translations. The UI is in English (D-055).
- Discounts.
- Mapping Cyrillic look-alike letters in plates (С, А, В and so on) to Latin. Plates must be typed in Latin letters for search and the duplicate-plate check to work (`shortcut:` comment in `src/lib/format.ts`).
- Storing IP addresses or device fingerprints with approvals, for GDPR reasons (D-067).

## Run it locally

### Prerequisites

- Node.js 24 (`engines` in `package.json`)
- pnpm 11 (the exact version is pinned in `packageManager`)
- Docker, running. The Supabase CLI is a dev dependency and runs the local database in Docker.

### First run

```bash
pnpm install                    # also points git hooks at .githooks (secret scan)
pnpm db:start                   # start the local Supabase stack in Docker
pnpm db:reset                   # apply every migration to the local database (run again to start over)
node scripts/ci-write-env.mjs   # write .env.development.local with the local stack's URL and keys
pnpm credentials:generate       # create the 4 seed staff passwords in .env.local and CREDENTIALS.local.md
pnpm seed:local                 # load the demo garage and print demo customer links
pnpm dev                        # http://localhost:3000
```

No command prints a key or a password. The seed prints the demo customer links, which work like passwords for those jobs.

### Env files

| File | In git | What it holds |
|---|---|---|
| `.env.example` | Yes | Every variable the app needs, with no secret values. Copy it to `.env.local` to point the app at a real Supabase project. |
| `.env.development.local` | No | The local stack's URL and keys, written by `node scripts/ci-write-env.mjs`. In `pnpm dev` Next.js prefers it over `.env.local`. |
| `.env.local` | No | A real project's keys and the `SEED_*_PASSWORD` values. |

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project URL and public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Read in `src/lib/supabase/admin.ts` and by the scripts. |
| `NEXT_PUBLIC_SITE_URL` | Base URL for customer links, no trailing slash |
| `SEED_OWNER_PASSWORD`, `SEED_MECHANIC_1_PASSWORD` to `SEED_MECHANIC_3_PASSWORD` | Seed staff passwords, generated by `pnpm credentials:generate` |

### Tests

```bash
pnpm lint
pnpm typecheck
pnpm test                               # unit tests, no database
pnpm test:integration                   # database tests; needs the local stack and .env.development.local
pnpm exec playwright install chromium   # once, before the first e2e run
pnpm test:e2e                           # desktop and 375px phone; starts pnpm dev itself
```

To run the e2e suite against a deployed app, set `E2E_BASE_URL`:

```bash
E2E_BASE_URL=https://garage-desk-tau.vercel.app pnpm test:e2e
```

In PowerShell: `$env:E2E_BASE_URL="https://garage-desk-tau.vercel.app"; pnpm test:e2e`.

For a deployed URL, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` of that project must be set in the shell. The `.env.development.local` fallback is only used for local URLs. The suite creates its own staff (on `@e2e.garagedesk.test`) and jobs in that project, so on production run it before the seed, which clears jobs (PLAN 4.2).

### Other scripts

| Command | What it does |
|---|---|
| `pnpm build`, `pnpm start` | Production build and server |
| `pnpm db:types` | Regenerate `src/lib/database.types.ts` from the local database |
| `pnpm secrets:scan` | Scan staged files for secrets (the pre-commit hook runs it) |
| `pnpm bundle:scan` | After `pnpm build`, check the client bundle for server secrets |
| `pnpm seed -- --confirm-wipe` | Seed the project in `.env.local`. **Deletes every customer, vehicle and job there.** |

### Where things are

| Path | What |
|---|---|
| `src/app/(staff)/` | Staff pages: jobs, customers, dashboard, settings |
| `src/app/[token]/` | The customer link page and its Approve/Decline actions |
| `src/proxy.ts` | CSP nonce, session refresh, the link check before render |
| `src/lib/` | Money, formatting, statuses, tokens, the public DTO, rate limiting, data access |
| `supabase/migrations/` | Schema, RLS, `transition_job` and the other database functions |
| `scripts/` | Seed, credentials, env writer, secret scans |
| `tests/unit/`, `tests/integration/`, `e2e/` | Vitest unit, Vitest database, Playwright |

## Demo accounts

The seed creates 1 owner and 3 mechanics (`scripts/staff.ts`):

| Name | Role | Email |
|---|---|---|
| Georgi Petrov | Owner | owner@garagedesk.test |
| Ivan Dimitrov | Mechanic | ivan@garagedesk.test |
| Nikolay Stoyanov | Mechanic | nikolay@garagedesk.test |
| Stefan Kolev | Mechanic | stefan@garagedesk.test |

Passwords are never in this repo. `pnpm credentials:generate` creates a strong random password for each account once, before seeding. It writes them only to two gitignored files: `.env.local`, which the seed reads, and `CREDENTIALS.local.md`, which is sent to the client separately and then deleted. A production seed run also adds the demo customer links to that file.

The demo garage is "Petrov Auto Service": €45.00/h, 20% VAT, 10 customers, 15 vehicles and 20 jobs across all 8 statuses, covering every scenario in PRD §8.

## Deploy and secrets

- **Secrets stay out of the repo.** Only `.env.example` is committed. In the app, the service-role key is read in one module, `src/lib/supabase/admin.ts`, which starts with `import 'server-only'`. Never put it in a `NEXT_PUBLIC_*` variable.
- **Secret scan on every commit and push.** `pnpm install` points git at `.githooks`. The pre-commit hook scans staged files, the pre-push hook scans all tracked files, and CI scans again. It blocks env files, `.vercel/`, `CREDENTIALS.local.md`, key patterns and any exact value from your local env files. After each CI build, `pnpm bundle:scan` checks the client bundle. (D-046)
- **Schema changes only through migrations.** Add a new file to `supabase/migrations/` and apply it with `supabase db push`. Never edit a migration that has been applied. D-065 explains how migrations reach the remote project today.
- **Production deploys.** Export the pushed commit with `git archive HEAD` into an empty folder (plus `.vercel/project.json`) and run `vercel deploy --prod` there as `kurtgav`, so only committed files are uploaded and the deploy is not blocked by the commit-author check on the Hobby plan (D-073, D-075). Git deployments are off on the Vercel project.
- **Env vars live in Vercel.** `NEXT_PUBLIC_SITE_URL` must be the live URL, because customer links are built from it. Preview deployments fall back to the request's origin. `pnpm credentials:generate --push-vercel` also stores the seed passwords in the Vercel production env.
- **CI.** GitHub Actions runs on every push to `main` and every pull request: secret scan, lint, typecheck and unit tests, then integration tests, build, bundle scan and e2e against a throwaway local Supabase stack, never production. (D-006)
