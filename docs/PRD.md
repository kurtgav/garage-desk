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
| **Owner** | Everything: customers, vehicles, all jobs, assignment and reassignment, phone approvals, cancellation, dashboard, settings |
| **Mechanic** | Creates and edits customers, vehicles and jobs (a job they create is assigned to them). Sees and works only on jobs assigned to them. Cannot reassign, record phone approvals, cancel, or see other mechanics' jobs, the dashboard or settings. |
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
                hourly_rate_cents, vat_bps (default 2000 = 20%), currency ('EUR'), timezone ('Europe/Sofia')
customers       id, full_name, phone, email?, created_at
vehicles        id, customer_id → customers, plate (unique, normalised), make, model, year
jobs            id, ref (e.g. GD-0042, human-readable, NOT used for access),
                vehicle_id → vehicles, assigned_mechanic_id → profiles,
                description, status, vat_bps (snapshot at job creation),
                quote_version (current quote, null before the first), quoted_subtotal_cents,
                quoted_vat_cents, quoted_total_cents, quoted_at,
                approved_quote_version, approved_subtotal_cents, approved_vat_cents,
                approved_total_cents, approved_at, collected_at, created_by, created_at
job_line_items  id, job_id, kind ('labour'|'part'), description,
                quantity numeric(10,2),           -- hours for labour, qty for parts
                unit_price_cents int,             -- excl. VAT; labour: hourly rate SNAPSHOT at line creation
                line_total_cents numeric(16,2) GENERATED ALWAYS AS (quantity * unit_price_cents) STORED  -- exact, never rounded
job_quotes      id, job_id, version (1, 2, …), subtotal_cents, vat_cents, total_cents, vat_bps,
                lines jsonb (snapshot of every line), created_by → profiles, created_at   -- immutable
job_events      id, job_id, from_status, to_status, actor_type ('staff'|'customer'),
                actor_id → profiles (null for customer), channel ('link'|'phone', approvals only),
                quote_version, total_cents (quote total the event refers to), note, created_at
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
- All staff (owner and mechanics) can create, search and edit customers and vehicles; only the owner can delete them. A customer has 1..n vehicles (plate, make, model, year).
- A single search box matches name, phone or plate (partial match, ignoring case and spacing).

**AC**
- Given the plate "ABC 1234" exists, when the owner searches "abc1234", then that vehicle and its customer appear.

### FR3 — Job cards and line items
- A job has exactly 1 vehicle and 1 assigned mechanic, a description, a status, and line items.
- **Owner and mechanics can create jobs.** A job created by a mechanic is always assigned to that mechanic. Only the owner can choose or change (reassign) the mechanic.
- Labour line: hours × hourly rate. The rate is **copied from settings when the line is added**.
- Part line: quantity × unit price. All prices are entered **excluding VAT**.
- **Totals are never entered by hand.** Line totals are generated columns; job totals are computed by a single DB function or view.
- Line items are editable while the job is `New`, `Quoted`, `Declined`, `Approved` or `In progress`, and locked in `Ready`, `Collected` and `Cancelled`. Changing lines on a `Quoted`, `Approved` or `In progress` job creates a new quote version and puts the job back to `Quoted` (FR5).

### FR4 — Money rules (single source of truth)
- Currency **EUR**, garage timezone **Europe/Sofia** (client answer, §12). Prices are entered **excluding VAT**. Quotes, the customer page and the job page show **net, VAT and total**.
- Unit prices are integer **cents**; quantities have 2 decimals. Floats are never used.
- `line_total = quantity × unit_price_cents`, stored **exactly** (numeric, never rounded per line). Line totals are displayed with as many decimals as they have (e.g. €56.875).
- `net (subtotal) = round(Σ line_total)` — VAT is calculated on the **job total, not per line**.
- `vat = round(Σ line_total × vat_bps / 10000)`
- `total = net + vat`
- Rounding happens **once, at the end**, to whole cents (2 decimals), half away from zero. Default VAT is **20%**, changeable in settings.
- **Rate rule:** changing `settings.hourly_rate_cents` or `vat_bps` never changes an existing line item or job. Each move to `Quoted` freezes the net, VAT, total and a snapshot of every line into an immutable quote version (`job_quotes`). An approval stores the approved version and its net/VAT/total as dispute evidence.

**AC**
- Given job J was quoted at €40.00/h, when the owner changes the rate to €45.00/h, then J's quoted total is unchanged, and a new labour line on a new job uses €45.00/h.
- Given lines 1.25 h × €45.50 and 0.5 × €12.25, with VAT at 20%, then net = €63.00, VAT = €12.60, total = €75.60 (rounding each line first would wrongly give €63.01).
- Given one line 0.75 h × €45.50 (= €34.125), with VAT at 20%, then net = €34.13, VAT = €6.83 (exact €6.825), total = €40.96.

### FR5 — Status flow
`New → Quoted → Approved → In progress → Ready → Collected`, plus `Declined` and `Cancelled` (client answers, §12).

| From → To | Who | Guard / effect |
|---|---|---|
| New → Quoted | Owner, assigned mechanic | ≥1 line item. Creates quote version 1. |
| Declined → Quoted (re-quote) | Owner, assigned mechanic | ≥1 line item. Creates the next quote version. |
| Quoted → Approved | **Customer via link**, or **owner recording a phone approval** (note required) | The approval names the quote version the approver saw; if it is not the current version, nothing changes. Stores `approved_*` from that version. Mechanics cannot record approvals. |
| Quoted → Declined | Customer via link | Optional reason. Declined jobs are not revenue. |
| Quoted / Approved / In progress → Quoted (revised) | Automatic when an owner or assigned mechanic changes line items | Creates the next quote version. The earlier approval stays in the timeline. The customer approves the new total through the same link. |
| Approved → In progress | Owner, assigned mechanic | — |
| In progress → Ready | Owner, assigned mechanic | — |
| Ready → In progress (rework) | Owner, assigned mechanic | Optional note. |
| Ready → Collected | Owner, assigned mechanic | The approved version must be the current version. Sets `collected_at` (used for revenue). |
| any except Collected / Cancelled → Cancelled | **Owner only** | Reason required. Final. Not revenue. |
| Anything else | — | Rejected |

- All transitions go through **one Postgres function** `transition_job(…)`. It validates the table above and the actor's role, updates the job, and inserts a `job_events` row **in a single transaction**. Line-item triggers call the same function for the automatic re-quote.
- **The customer is never charged for a total they did not approve:** a job can only reach `Approved`, `In progress`, `Ready` or `Collected` while its current quote version is the approved one.
- The job page shows a timeline built from `job_events`: who, what and when, in local time, with the quote version and total for quotes and approvals. A phone approval reads "Phone approval recorded by ⟨staff name⟩" with its note, never as a customer click.

**AC**
- Given a job in `Quoted`, when staff attempt `In progress`, then it is rejected and no event is written.
- Given any successful transition, then exactly one event exists with the actor and timestamp.
- Given an approved job, when a part line is added, then the job is `Quoted` with version 2, the v1 approval is still in the timeline, and `Collected` is impossible until v2 is approved.
- Given a customer page showing v1, when the customer presses Approve after staff created v2, then nothing changes.
- Given a mechanic, when they try to record a phone approval or cancel a job, then it is rejected.

### FR6 — Customer approval link
- Staff click "Create customer link" on a `Quoted` job (also allowed while `Declined`, `Approved`, `In progress` or `Ready`). The server generates a **32-byte CSPRNG token** (base64url) and stores **only its SHA-256 hash**. The full URL `/{token}` is shown once with Copy and "Share via WhatsApp" (`wa.me`) buttons.
- "Regenerate link" revokes the old token, since the raw token is never stored.
- The public page is rendered on the server. It looks up the job by token hash using a **server-only** privileged query that returns a fixed whitelisted DTO:
  - **Shown:** garage name, address and phone; job ref; vehicle make, model and plate; customer first name; line item description, quantity, unit price and line total; net, VAT, total and the quote version; current status; public timeline (status and date only; a phone approval reads "Approved by phone (recorded by the garage)").
  - **Never shown:** customer phone or email, other vehicles or jobs, staff names, internal notes, internal IDs.
- **The link does not expire** (client answer). Staff can revoke or regenerate it at any time.
- **Approve** and **Decline** are POST server actions that work only while the status is `Quoted` and only for the quote version the page showed. After that, the same link shows the current status. Pressing Approve on a stale page (older version, or job no longer `Quoted`) changes nothing and tells the customer to refresh. They are idempotent, and Decline takes an optional reason. Both are recorded as `actor_type='customer'`, `channel='link'`.
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
- The same link shows the current status and timeline after approval: "Your car is ready for collection" when `Ready`, with the garage phone and address. `Declined` and `Cancelled` show a plain status sentence (no buttons). A re-quote shows the new version with Approve/Decline again.

### FR8 — Owner dashboard
- Job count per status.
- List of jobs `Ready` for collection, with customer, plate, total and days waiting.
- **Revenue this month** = Σ `approved_subtotal_cents` (**net, excluding VAT**) of jobs marked `Collected` in the current calendar month, in garage timezone (Europe/Sofia). A job counts in the month it was marked Collected. Declined and cancelled jobs are never revenue.
- **Mechanic workload:** open jobs per mechanic, where open means any status except `Collected` and `Cancelled`, broken down by status.

**AC**
- Given seeded jobs collected this month and last month, then revenue includes only this month's, matching a hand-calculated value in tests.

### FR9 — Settings (owner only)
- Hourly rate, VAT % (default 20%), garage name, address and phone.
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
- **10 customers and 15 vehicles** with realistic Sofia names, Bulgarian phone numbers, Bulgarian plates (e.g. `CA 4521 KM`) and common makes. Prices in EUR, VAT 20%.
- **20 jobs across all 8 statuses** (at least 2 each), spread across the mechanics, with consistent timelines:
  - Some jobs `Collected` this month and some last month, to prove the revenue filter.
  - At least 1 job quoted at an older hourly rate, to demonstrate the rate rule.
  - At least 1 declined-then-requoted job, and 1 job still `Declined` with a reason.
  - At least 1 owner phone approval with a note.
  - At least 1 job with extra work after approval (v1 approved, v2 approved later), both approvals visible in the timeline.
  - At least 1 rework (Ready → In progress) and 2 cancelled jobs with reasons.
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

## 12. Open questions — answered by the client (2026-11-02)

The client's answers replace the earlier assumptions and are reflected in §5, FR2–FR9 and §8 above.

| # | Question | Client answer |
|---|---|---|
| 1 | Is "revenue" including or excluding VAT? | Net, excluding VAT. A job counts in the month it was marked Collected. |
| 2 | Which timezone and currency? | Europe/Sofia, EUR. Prices are entered excluding VAT. Show net, VAT and total. |
| 3 | Is VAT rounded per line or on the total? | On the job total. Line amounts stored exactly, rounded once at the end to 2 decimals. Default VAT 20%, changeable in settings. |
| 4 | What happens on Decline? | Job moves to `Declined` with an optional customer reason. Staff edit lines and re-quote → `Quoted`; the customer approves again. Declined jobs are not revenue. |
| 5 | Can the owner record a phone approval? | Yes, owner only, with a short note. The timeline must show it was recorded by staff, not clicked by the customer. |
| 6 | Does the link expire? | No. Approve/Decline work only while `Quoted`; afterwards the link shows the current status. A stale Approve changes nothing. |
| 7 | Can mechanics create jobs or customers? | Yes: customers, vehicles and jobs. A job a mechanic creates is assigned to them. Only the owner reassigns jobs, sees other mechanics' jobs and changes settings. |
| 8 | Is there cancellation or rework (Ready → In progress)? | Rework: yes, owner or assigned mechanic, in the timeline. Cancel: owner, any job not yet Collected; final, with a reason; not revenue. |
| 9 | Can extra work be added after approval? | Yes. Changing lines on an Approved or In progress job puts it back to `Quoted`; the customer approves the new total through the same link. The earlier approval stays visible in the timeline. |

**Rule that follows from all answers:** the customer must never be charged for a total they did not approve, and the timeline must prove what was approved and when.
