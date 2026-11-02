# PRD — Garage Desk

**Status:** Draft v1 · **Owner:** Kurt Gabayan · **Due:** Thursday, 5 Nov 2026
**Source:** Trial brief "Garage Desk" (client: small car repair garage, 1 owner + 3 mechanics)

---

## 1. Problem

The garage runs jobs on paper and WhatsApp. This causes three problems:

1. Customers phone in asking "is my car ready?"
2. Quotes are approved verbally, which leads to disputes.
3. The owner has no view of workload or revenue.

## 2. Goals and success metrics

| Goal | Measure |
|---|---|
| End verbal-approval disputes | 100% of approvals are recorded with a timestamp and the approved total, via the customer link |
| Cut "is my car ready?" calls | The customer link shows live status, with no login required |
| Correct numbers, always | Totals, VAT, the rate-snapshot rule and revenue are all covered by automated tests |
| Strict data isolation | Mechanics only see their jobs; the customer link exposes only its own quote and status. Enforced in the database and tested. |

## 3. Users and roles

| Role | Access |
|---|---|
| **Owner** | Everything: customers, vehicles, all jobs, assignment, dashboard, settings |
| **Mechanic** | Only jobs assigned to them, plus the customer and vehicle on those jobs. Cannot see the dashboard, settings or the customer directory. |
| **Customer** | No account. Accesses one job through a private link: sees the quote, can approve or decline, and later sees the status. |

## 4. Stack (decisions → `docs/DECISIONS.md`)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One codebase for the staff app, the public link and server logic. Server Actions keep secrets on the server. |
| DB + Auth | Supabase (Postgres + Auth) | Relational data fits the domain. **Row Level Security** enforces role isolation inside the database, not only in UI code. |
| UI | Tailwind + shadcn/ui | Clean, accessible, fast to build |
| Hosting | Vercel (app) + Supabase (DB) | Zero-ops deploys, preview URLs, environment variables managed outside the repo |
| Tests | Vitest (unit/integration) + Playwright (end-to-end, including a mobile viewport) | Covers both money logic and the full flow |
| CI | GitHub Actions: lint, typecheck, unit, e2e | `main` is always deployable |

## 5. Data model

```
profiles        id (= auth.users.id), full_name, role ('owner'|'mechanic'), active
settings        id (singleton), garage_name, garage_address, garage_phone,
                hourly_rate_cents, vat_bps, currency ('PHP'), timezone ('Asia/Manila')
customers       id, full_name, phone, email?, created_at
vehicles        id, customer_id → customers, plate (unique, normalised), make, model, year
jobs            id, ref (e.g. GD-0042, human-readable, NOT used for access),
                vehicle_id → vehicles, assigned_mechanic_id → profiles,
                description, status, vat_bps (snapshot at job creation),
                quoted_subtotal_cents, quoted_vat_cents, quoted_total_cents, quoted_at,
                approved_total_cents, approved_at, collected_at, created_by, created_at
job_line_items  id, job_id, kind ('labour'|'part'), description,
                quantity numeric(10,2),           -- hours for labour, qty for parts
                unit_price_cents int,             -- labour: hourly rate SNAPSHOT at line creation
                line_total_cents GENERATED ALWAYS AS (round(quantity * unit_price_cents)) STORED
job_events      id, job_id, from_status, to_status, actor_type ('staff'|'customer'),
                actor_id → profiles (null for customer), note, created_at
job_links       id, job_id, token_hash (sha256, unique), created_by, created_at,
                revoked_at, last_viewed_at
```

Search covers name, phone and plate. Normalise phone numbers (digits only) and plates (uppercase, no spaces) on write, and use trigram or `ilike` indexes.

## 6. Functional requirements

### FR1 — Staff sign-in and roles
- Email and password through Supabase Auth. **No public sign-up.** Accounts are created by the seed or admin script.
- Role is stored in `profiles.role`. Every query is checked by RLS, and UI hiding is cosmetic only.

**AC**
- Given a mechanic is signed in, when they request another mechanic's job by URL or API, then they get not-found and no data.
- Given a mechanic is signed in, when they open `/dashboard` or `/settings`, then access is denied.

### FR2 — Customers and vehicles
- Owner can do CRUD on customers. A customer has 1..n vehicles (plate, make, model, year).
- A single search box matches name, phone or plate (partial match, ignoring case and spacing).

**AC**
- Given the plate "ABC 1234" exists, when the owner searches "abc1234", then that vehicle and its customer appear.

### FR3 — Job cards and line items
- A job has exactly 1 vehicle and 1 assigned mechanic, a description, a status, and line items.
- Labour line: hours × hourly rate. The rate is **copied from settings when the line is added**.
- Part line: quantity × unit price.
- **Totals are never entered by hand.** Line totals are generated columns; job totals are computed by a single DB function or view.
- Line items are editable only while the job is `New`.

### FR4 — Money rules (single source of truth)
- All money is integer **cents**. Floats are never used.
- `line_total = round(quantity × unit_price_cents)`, rounding half away from zero.
- `subtotal = Σ line_total`
- `vat = round(subtotal × vat_bps / 10000)`. VAT is calculated **once, on the subtotal**, not per line.
- `total = subtotal + vat`
- **Rate rule:** changing `settings.hourly_rate_cents` or `vat_bps` never changes an existing line item or job. On transition to `Quoted`, the subtotal, VAT and total are **frozen** into `quoted_*`. On approval, `approved_total_cents` is also stored as dispute evidence.

**AC**
- Given job J was quoted at ₱800/h, when the owner changes the rate to ₱1,000/h, then J's quoted total is unchanged, and a new labour line on a new job uses ₱1,000/h.
- Given lines 1.5h × ₱800 and 2 × ₱1,250.50, with VAT at 12%, then subtotal = ₱3,701.00, VAT = ₱444.12, total = ₱4,145.12.

### FR5 — Status flow
`New → Quoted → Approved → In progress → Ready → Collected`

| From → To | Who | Guard |
|---|---|---|
| New → Quoted | Owner, assigned mechanic | ≥1 line item. Freezes totals and locks lines. |
| Quoted → Approved | **Customer via link only** | Records `approved_at` and `approved_total_cents` |
| Quoted → New | Customer (Decline) or staff (Revise quote) | Unlocks lines. The event records who did it and why. |
| Approved → In progress | Owner, assigned mechanic | — |
| In progress → Ready | Owner, assigned mechanic | — |
| Ready → Collected | Owner, assigned mechanic | Sets `collected_at` (used for revenue) |
| Anything else | — | Rejected |

- All transitions go through **one Postgres function** `transition_job(job_id, to_status, note)`. It validates the table above and the actor's role, updates the job, and inserts a `job_events` row **in a single transaction**.
- The job page shows a timeline built from `job_events`: who, what and when, in local time.

**AC**
- Given a job in `Quoted`, when staff attempt `In progress`, then it is rejected and no event is written.
- Given any successful transition, then exactly one event exists with the actor and timestamp.

### FR6 — Customer approval link
- Staff click "Create customer link" on a `Quoted` job. The server generates a **32-byte CSPRNG token** (base64url) and stores **only its SHA-256 hash**. The full URL `/{token}` is shown once with Copy and "Share via WhatsApp" (`wa.me`) buttons.
- "Regenerate link" revokes the old token, since the raw token is never stored.
- The public page is rendered on the server. It looks up the job by token hash using a **server-only** privileged query that returns a fixed whitelisted DTO:
  - **Shown:** garage name, address and phone; job ref; vehicle make, model and plate; customer first name; line item description, quantity, unit price and line total; subtotal, VAT, total; current status; public timeline (status and date only).
  - **Never shown:** customer phone or email, other vehicles or jobs, staff names, internal notes, internal IDs.
- **Approve** and **Decline** are POST server actions, valid only while the status is `Quoted`. They are idempotent, and Decline takes an optional reason. Both are recorded as `actor_type='customer'`.
- Hardening:
  - Invalid or revoked tokens return a generic 404, identical to any unknown URL.
  - `noindex`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
  - Rate-limit the public route.
  - Ensure job refs and UUIDs cannot be used to access anything.

**AC**
- Given a valid link, when it is opened on a 375px phone without login, then the quote is readable and Approve works.
- Given any modified or guessed token, then 404 with no timing or content difference.
- Given a link, then the response body contains no field outside the whitelist (asserted in tests).

### FR7 — Customer status page
- The same link shows the current status and timeline after approval: "Your car is ready for collection" when `Ready`, with the garage phone and address.

### FR8 — Owner dashboard
- Job count per status.
- List of jobs `Ready` for collection, with customer, plate, total and days waiting.
- **Revenue this month** = Σ `quoted_total_cents` of jobs with `collected_at` in the current calendar month, in garage timezone. Shown both **excluding VAT** (primary) and **including VAT**.
- **Mechanic workload:** open jobs per mechanic, where open means any status except `Collected`, broken down by status.

**AC**
- Given seeded jobs collected this month and last month, then revenue includes only this month's, matching a hand-calculated value in tests.

### FR9 — Settings (owner only)
- Hourly rate, VAT %, garage name, address and phone.
- Changes apply only to future line items and jobs (see FR4).

## 7. Non-functional requirements

- **Security:**
  - No secrets in the repo or client bundle. Only `.env.example` is committed.
  - The service-role key is used only in server modules (`import 'server-only'`).
  - RLS is enabled on every table.
  - Security headers are set.
  - Run Supabase advisors with zero critical findings.
- **Mobile:** the customer page is designed mobile-first. The staff app is usable on a tablet.
- **Accessibility:** semantic HTML, labelled inputs, AA contrast, keyboard navigable.
- **Design:** clean, calm, trustworthy. Readable totals and clear status badges. Something an owner would pay for.
- **Time:** stored in UTC and displayed in the garage timezone.
- **Quality:** typecheck, lint and tests all green in CI before merge. One logical change per commit, with conventional commit messages.

## 8. Seed data (deterministic script, re-runnable)

- **Staff:** 1 owner and 3 mechanics. The brief requires at least 1 owner and 1 mechanic; this matches the real garage. Passwords come from environment variables, never committed.
- **10 customers and 15 vehicles** with realistic local names, phone numbers, plates (e.g. `NAB 4521`) and common makes.
- **20 jobs across all 6 statuses** (at least 2 each), spread across the mechanics, with consistent timelines:
  - Some jobs `Collected` this month and some last month, to prove the revenue filter.
  - At least 1 job quoted at an older hourly rate, to demonstrate the rate rule.
  - At least 1 declined-then-requoted job.
  - At least 1 active customer link, whose URL is printed by the seed script.

## 9. Out of scope (stated in README)

- Payments and invoicing PDFs
- Sending SMS or WhatsApp automatically (staff share the link manually)
- Parts inventory and catalogue
- Appointments and booking
- Staff management UI
- Multi-garage support
- Offline mode
- i18n
- Discounts
- Changing approved work mid-repair. This would need a re-quote flow; listed in next steps.

## 10. Delivery plan

| Day | Milestone | Daily update |
|---|---|---|
| Mon | PRD, decisions, questions posted; scaffold, schema, RLS, CI | ✓ |
| Tue | **Thin vertical slice live on Vercel:** create job → quote → link → approve → collected → dashboard number | ✓ |
| Wed | Full features: search, timeline, settings rule, dashboard, design polish; security review | ✓ |
| Thu | Seed, e2e on mobile, README, walkthrough, next-steps list; post credentials | ✓ |

**Definition of Done (per feature):** acceptance criteria pass as automated tests, code is reviewed, it is deployed to the live URL, and `DECISIONS.md` is updated if a choice was made.

## 11. Deliverables

1. Live URL with seeded data. Credentials are posted in the channel, not the repo.
2. Repository with a README covering: what was chosen and why (DB, framework, hosting, approval-link design), what was deliberately left out, and how to run locally.
3. Walkthrough: create job → quote → approve as customer (phone) → finish → dashboard.
4. "Next steps if this became real" list.

## 12. Open questions (posted in channel — building on the stated assumption until answered)

| # | Question | Assumption |
|---|---|---|
| 1 | Is "revenue" including or excluding VAT? | Show both; excluding VAT is primary |
| 2 | Which timezone and currency? | Asia/Manila, PHP |
| 3 | Is VAT rounded per line or on the total? | On the subtotal, once |
| 4 | What happens on Decline? | Job returns to `New`, staff revise and re-quote, same link shows the new quote |
| 5 | Can the owner record a phone approval? | No. Approval only via the link, which is the whole point. |
| 6 | Does the link expire? | Active until 30 days after `Collected`; revocable anytime |
| 7 | Can mechanics create jobs or customers? | No. The owner creates and assigns; mechanics edit lines and progress their own jobs. |
| 8 | Is there cancellation or rework (Ready → In progress)? | Not in v1; listed in next steps |
| 9 | Can extra work be added after approval? | Not in v1; would require re-approval |
