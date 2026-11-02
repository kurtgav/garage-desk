# Delivery plan

Phases follow PRD §10. Each phase ends with: qa-engineer runs the full suite, security-engineer reviews the phase diff (high/critical fixed before moving on), commit + push, Vercel deployment green, runtime logs checked, 2-line entry in `docs/UPDATES.md`.

Owners: **BE** backend-data-engineer · **SEC** security-engineer · **FE** frontend-designer · **QA** qa-engineer · **OPS** devops-release · **DOC** tech-writer.

## Shared contracts (read before any task)

### Database (`supabase/migrations/`)
- Enum `job_status`: `new, quoted, approved, in_progress, ready, collected`. Enum `staff_role`: `owner, mechanic`. Enum `line_kind`: `labour, part`. Enum `actor_type`: `staff, customer`.
- Tables exactly as PRD §5, plus `rate_limits(key text, window_start timestamptz, count int, pk(key, window_start))`.
- `jobs.ref` default `'GD-' || lpad(nextval('job_ref_seq')::text, 4, '0')`, unique.
- Money columns: `unit_price_cents int`, all totals `bigint`. `line_total_cents bigint generated always as (round(quantity * unit_price_cents)::bigint) stored`.
- Triggers: normalise `customers.phone` (digits only) and `vehicles.plate` (upper, strip spaces/dashes); `jobs` before insert → `vat_bps` from settings, `status='new'`, `created_by=auth.uid()` if null; `jobs` after insert → event `null→new`; `job_line_items` before insert → labour `unit_price_cents` from `settings.hourly_rate_cents`; before insert/update/delete → parent job must be `new`.
- Helpers (schema `private`, security definer, `search_path=''`): `private.staff_role() returns staff_role` (null if no active profile), `private.is_owner()`, `private.is_staff()`, `private.can_access_job(job_id uuid)` (owner, or assigned mechanic).
- Functions in `public` (all `set search_path = ''`):
  - `compute_job_totals(p_job_id uuid) returns table(subtotal_cents bigint, vat_cents bigint, total_cents bigint)` — the only money arithmetic. View `job_totals` (`security_invoker = true`) exposes it per job.
  - `transition_job(p_job_id uuid, p_to_status job_status, p_note text default null, p_link_token_hash text default null) returns jobs` — D-009.
  - `create_job_link(p_job_id uuid, p_token_hash text) returns timestamptz` — staff; revokes the active link and inserts the new hash atomically (D-013, D-015).
  - `public_job_by_token_hash(p_token_hash text) returns jsonb` — service role only, whitelisted DTO or null, touches `last_viewed_at` (D-014).
  - `rate_limit_hit(p_key text, p_max int, p_window_seconds int) returns boolean` — service role only, true when over the limit (D-012).
  - `get_dashboard(p_now timestamptz default now()) returns jsonb` — owner only (raises otherwise): `{counts_by_status, ready_jobs[], revenue:{excl_vat_cents, incl_vat_cents, month_start, month_end}, workload[]}`.
  - `search_customers(p_query text) returns setof customers` (security invoker) — name ilike, phone digits ilike, plate normalised ilike.
- Errors raised with stable messages the app maps to UI text: `invalid_transition`, `forbidden`, `no_line_items`, `job_locked`, `not_found`.

### App (`src/`)
- `src/lib/supabase/server.ts` (cookie client, user JWT), `src/lib/supabase/admin.ts` (`import 'server-only'`, secret key), `src/proxy.ts` (session refresh).
- `src/lib/money.ts`: `formatCents(cents)`, `parsePesoToCents(input)`, `bpsToPercentString(bps)`, `percentToBps(input)`. `src/lib/status.ts`: labels, badge tones, `STAFF_TRANSITIONS`.
- `src/lib/tokens.ts` (server-only): `generateLinkToken()`, `hashLinkToken(token)`.
- `src/lib/public-job.ts` (server-only): `PUBLIC_JOB_KEYS`, `getPublicJob(token)`.
- Staff routes: `/login`, `/jobs`, `/jobs/new`, `/jobs/[id]`, `/customers`, `/customers/new`, `/customers/[id]`, `/dashboard`, `/settings`. Public: `/[token]`.
- Server actions return `{ ok: true } | { ok: false, error: string }` and never echo DB errors verbatim.

### Tests
- `tests/unit/**` (no DB), `tests/integration/**` (local Supabase; creates its own users via admin API; fixed clock via `p_now`), `e2e/**` (Playwright; projects `desktop` and `mobile-375`). `E2E_BASE_URL` switches local ↔ production.

## Phase 1 — Foundation (Mon)

| Task | Owner | Files | ACs / scope | Verification |
|---|---|---|---|---|
| 1.1 Repo, CI skeleton, scripts | OPS | `.github/workflows/ci.yml`, `package.json` scripts, `scripts/secrets-scan.mjs`, `.env.example` | lint, typecheck, unit, integration, e2e jobs; secret scan of staged files | CI green on push |
| 1.2 Schema, RLS, functions | BE | `supabase/config.toml`, `supabase/migrations/*` | §5, FR1 (RLS), FR3, FR4, FR5, FR6 DB side, FR8 functions | `supabase db reset` clean; integration tests |
| 1.3 DB integration tests | QA | `tests/integration/*`, `vitest.config.ts` | FR1 isolation, FR4 worked example + rate rule, FR5 reject + one event, FR6 hash/whitelist, FR8 revenue month filter | `pnpm test:integration` green |
| 1.4 Design system + shell | FE | `src/app/globals.css`, `src/components/ui/*`, `src/app/layout.tsx`, `src/app/not-found.tsx`, `src/app/login/*` | tokens, AA contrast, button/input/label/card/badge/table/dialog, login form | lint/typecheck, visual check |

Parallel: 1.2 ∥ 1.4 ∥ 1.1 (disjoint files). 1.3 starts once 1.2's migrations exist.

## Phase 2 — Thin vertical slice LIVE (Tue)

Slice: owner creates job → adds lines → quote → create customer link → customer approves on phone → staff move to collected → dashboard revenue shows it.

| Task | Owner | Files | ACs / scope | Verification |
|---|---|---|---|---|
| 2.1 Data layer + server actions | BE | `src/lib/**`, `src/app/(staff)/jobs/**/actions.ts`, `src/app/[token]/actions.ts`, `src/proxy.ts` | auth helpers, job create, line CRUD, transition, create link, public DTO, rate limit | unit tests for money/tokens/DTO |
| 2.2 Slice pages | FE | `src/app/(staff)/layout.tsx`, `jobs/**`, `dashboard/page.tsx` (revenue card), `src/app/[token]/page.tsx` | FR3/FR5/FR6 UI, 375px public page | Playwright slice |
| 2.3 Slice e2e | QA | `e2e/slice.spec.ts`, `playwright.config.ts` | FR6 AC1 (375px approve), slice end to end | `pnpm test:e2e` green |
| 2.4 Supabase + Vercel + GitHub | OPS | `supabase/` link, Vercel env, repo | migrations pushed, envs set (prod + preview), auto-deploy from `main` | live URL smoke: login + public 404 |

Order: 2.1 → (2.2 ∥ 2.4) → 2.3. **Exit: slice live on Vercel.**

## Phase 3 — Full features + security review (Wed)

| Task | Owner | Files | ACs / scope | Verification |
|---|---|---|---|---|
| 3.1 Customers/vehicles CRUD + search | BE+FE | `src/app/(staff)/customers/**` | FR2 + AC "abc1234" | integration + e2e |
| 3.2 Job timeline in local time | FE | `src/components/timeline.tsx` | FR5 timeline | e2e |
| 3.3 Settings + rate rule | FE | `src/app/(staff)/settings/**` | FR9, FR4 AC1 | integration + e2e |
| 3.4 Full dashboard | FE | `src/app/(staff)/dashboard/**` | FR8 (counts, ready list, workload, revenue both ways) | integration |
| 3.5 Public page states | FE | `src/app/[token]/**` | FR7 ready message, revised, regenerate | e2e |
| 3.6 Polish + a11y | FE | UI | NFR mobile/a11y/design | axe check in e2e |
| 3.7 Security review | SEC | read-only | FR1, FR6, §7 | report; fix high/critical |

Parallel: 3.1 ∥ 3.3 ∥ 3.4 ∥ 3.5 (disjoint routes). 3.6 after. 3.7 last.

## Phase 4 — Seed, verification, docs (Thu)

| Task | Owner | Files | ACs / scope | Verification |
|---|---|---|---|---|
| 4.1 Credentials + seed | BE | `scripts/generate-credentials.ts`, `scripts/seed.ts` | §8 counts, old-rate job, decline→requote, active link printed | counts by status query |
| 4.2 Prod e2e + screenshots | QA | `e2e/**`, `docs/screenshots/*` | all e2e vs prod incl. 375px | green run |
| 4.3 Advisors + bundle scan | OPS/SEC | `scripts/check-bundle-secrets.mjs` | zero critical advisors; no key prefixes in `.next/static` | script output |
| 4.4 Docs | DOC | `README.md`, `docs/WALKTHROUGH.md`, `docs/NEXT-STEPS.md` | PRD §11 | review |

Order: 4.2 runs against prod **before** the final seed (e2e creates data), then 4.1 seeds prod, then 4.4.
