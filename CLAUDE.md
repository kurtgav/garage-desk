# Garage Desk — standing rules

Source of truth: `docs/PRD.md`. Plan: `docs/PLAN.md`. Decisions: `docs/DECISIONS.md`.

@AGENTS.md

## Stack (PRD §4)
- Next.js 16 (App Router) + TypeScript, pnpm. Read `node_modules/next/dist/docs/` before using an API you are unsure of (Next 16 renamed/changed APIs, e.g. `proxy.ts` instead of `middleware.ts`).
- Supabase Postgres + Auth via `@supabase/ssr` / `@supabase/supabase-js`.
- Tailwind v4 + shadcn/ui-style components in `src/components/ui`.
- Vitest (unit + DB integration), Playwright (e2e, incl. 375px mobile).
- GitHub Actions CI: lint, typecheck, unit, integration, e2e. Hosting: Vercel (Hobby) + Supabase.

## Money
- All money is integer **cents** (`int`/`bigint` in SQL, `number` integers in TS). Never floats, never `parseFloat` on money.
- Line totals are a generated column; job totals come only from `public.job_totals` / `compute_job_totals()` in the DB. The UI never adds money up.
- Parse user money input with `parsePesoToCents()` (string based), format with `formatCents()`.
- VAT once on the subtotal: `round(subtotal * vat_bps / 10000)`, half away from zero.

## Status and data rules
- Every status change goes through `public.transition_job()`. No other code (app, function, trigger) writes `jobs.status`. The only exception is the seed script, which inserts backdated history directly (see DECISIONS D-016).
- RLS is enabled on every table. UI hiding is cosmetic; the database is the boundary.
- Line items are editable only while the job is `new` (enforced by trigger + RLS).
- Labour unit price is copied from settings by a DB trigger; the client never sends it.

## Secrets
- No secrets in the repo, logs, or client bundle. Only `.env.example` is committed.
- The service-role/secret key is read only in modules starting with `import 'server-only'` (`src/lib/supabase/admin.ts`). Never in `NEXT_PUBLIC_*`.
- `CREDENTIALS.local.md`, `.env*` (except `.env.example`), `.vercel` are gitignored. Scan staged files for secrets before every push (`pnpm secrets:scan`).

## Done means
- The PRD ACs touched by the change pass as automated tests.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (and `pnpm test:e2e` for UI flows) are green.
- Non-obvious choices are logged in `docs/DECISIONS.md` (next free `D-0xx` id).

## Workflow
- Small conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`), one logical change each.
- Schema changes only as new files in `supabase/migrations/` (never edit an applied migration), pushed with `supabase db push`.
- Touch only Supabase project `ciqflsvaroxbrkjexjqx` and Vercel project `garage-desk` (scope `kurtgavs-projects`).
