> **Superseded.** This was the first-pass review before the client answered. The answers in `PRD.md` §12 and decisions D-047…D-073 replace the assumptions below (timezone, currency, phone format, link expiry and more).

# PRD review — contradictions and gaps

Each item: what the PRD says → the gap → the assumption I built on (safest reasonable reading). Decisions referenced are in `DECISIONS.md`.

| # | Topic | Gap / contradiction | Assumption taken |
|---|---|---|---|
| 1 | Customer actor vs `transition_job(job_id, to_status, note)` | The customer has no login, so the function cannot learn the actor from `auth.uid()`. | Optional 4th arg `p_link_token_hash`, service-role only; the function re-verifies the link in the same transaction. Still one state machine (D-009). |
| 2 | Link creation "on a `Quoted` job" vs Q4 ("same link shows the new quote" after decline) and FR7 (status after approval) | Links must outlive the `quoted` status. Unclear if a lost link can be re-issued after approval. | Links persist across statuses. Create/regenerate allowed in `quoted`…`ready` (D-015). While the job is back in `new`, the page says the quote is being revised, with no buttons. |
| 3 | Link expiry | Only in open question Q6, not in FR6. | Valid until 30 days after `collected_at`, revocable anytime (D-015). |
| 4 | Revenue "Σ `quoted_total_cents`" vs "excluding VAT is primary" | `quoted_total_cents` includes VAT. | Excl. VAT = Σ `quoted_subtotal_cents`; incl. VAT = Σ `quoted_total_cents`. Same job set (collected this calendar month, Asia/Manila). |
| 5 | Mechanic "access is denied" (dashboard) vs "not-found" (other's job) | Two different wordings. | Both return the generic 404 page; the DB returns nothing either way (D-020). |
| 6 | Who edits line items | FR3 says editable while `new`; Q7 says mechanics edit lines of their jobs. | Owner and the assigned mechanic can add/edit/delete lines while `new`. Only the owner creates jobs, customers, vehicles. |
| 7 | Editing a job after creation | Not specified. | Owner can change description and assigned mechanic until `collected`. Vehicle is fixed after creation (create a new job instead). |
| 8 | Deleting customers/vehicles | "CRUD on customers", but jobs reference them. | Delete is blocked (FK `restrict`) when jobs exist; the UI explains why. |
| 9 | "Days waiting" in the Ready list | No `ready_at` column. | Derived from the timestamp of the latest `→ ready` event. |
| 10 | Job creation in the timeline | FR5 events only cover transitions. | Creating a job writes one event `null → new` (actor = creator), so the timeline starts with "Job created". Transitions still write exactly one event each. |
| 11 | Rate limiting on Vercel Hobby | No platform rate limiting on the free tier; serverless memory is not shared. | Postgres fixed-window counter keyed by hashed IP (D-012). |
| 12 | 404 "identical to any unknown URL" | Security headers set only on the token route would make it distinguishable. | Same headers on every HTML response; every single-segment URL does the same hash lookup (D-013, D-019). |
| 13 | Seed passwords "from environment variables" vs trial brief "generated at seed time" | Both. | `pnpm credentials:generate` creates strong passwords once, writes them to `.env.local` (gitignored), Vercel env and `CREDENTIALS.local.md`. The seed reads them from env. |
| 14 | Seed history vs "all transitions through `transition_job`" | Backdated timelines cannot use `now()`. | Seed inserts history directly with consistent events (D-016). |
| 15 | Settings VAT "%" vs `vat_bps` | UI unit vs storage unit. | UI edits percent with up to 2 decimals (12.00%), stored as basis points (1200). |
| 16 | Inactive staff (`profiles.active`) | Effect not specified. | Inactive staff are treated as having no role: RLS returns nothing. |
| 17 | Staff profile visibility | Mechanics must not see "the customer directory", but timelines show staff names. | Active staff can read colleagues' `full_name` and `role` (D-018). |
| 18 | WhatsApp share target | `wa.me` needs an international number or none. | `wa.me/<63…>?text=` using the customer's phone (PH `09…` → `639…`); falls back to `wa.me/?text=` if the phone is not a PH mobile. |
| 19 | PRD location | Brief says `docs/PRD.md`; file was at repo root. | Moved to `docs/PRD.md`. |
| 20 | Public route `/{token}` at root | Shares the namespace with staff routes. | Static routes win in the App Router; the token route only handles single-segment URLs, and staff paths are never 43-char base64url strings. |
