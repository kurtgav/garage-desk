# Next steps

What to do if Garage Desk goes into real daily use, most urgent first. Each item has one line on why. D-ids point to [DECISIONS.md](DECISIONS.md).

## Now (before real customers use it)

1. **Delete `CREDENTIALS.local.md` once the credentials are posted.**
   Why: it holds every staff password in plain text; it is gitignored but still sits on a laptop (`scripts/generate-credentials.ts`).

2. **Rotate the seed passwords before real use, or replace the demo accounts.**
   Why: the demo passwords are shared in the client channel (PRD §11). `pnpm credentials:generate --rotate --push-vercel` makes new ones, and the next seed run applies them, but the seed also deletes every customer, vehicle and job, so do it before real data goes in. Better still, give each staff member an account on their own email.

3. **Move the database to the EU and the functions next to it: Supabase `eu-central-1`, Vercel `fra1`.**
   Why: today both run in Tokyo, so every request from Sofia makes a long round trip and customer names and phone numbers are stored outside the EU (D-066). Move both together: if only one side moves, every query crosses continents. Steps: new database in `eu-central-1`, apply `supabase/migrations/`, move the data, apply the Auth settings listed in D-065 (sign-up off, password policy, site URL), update the Vercel env vars, then set `regions` in `vercel.json` to `fra1`.

4. **Turn on automatic deploys: Vercel Git deployments, or a deploy job in CI.**
   Why: production is deployed by hand with `vercel deploy --prod` because Git deployments are disabled on the Vercel project (D-073), and migrations are pushed by hand because the CLI account has no Management API rights on the project (D-065). A merge to `main` should reach production without a laptop. First link the commit author email to the `kurtgav` Vercel account (or commit as that account): on the Hobby plan Vercel blocks deployments from commits by anyone else (D-075).

## Soon (first weeks of use)

5. **Map Cyrillic look-alike letters in plates to Latin.**
   Why: on a Bulgarian keyboard "СА 1234 КМ" is typed in Cyrillic and stored as a different plate from the Latin "CA 1234 KM", so search misses it and the unique-plate check lets a duplicate in. Add the mapping in `normalisePlate()` (`src/lib/format.ts`, marked `shortcut:`) and in the database trigger `private.normalise_vehicle`, then re-normalise existing plates in a migration.

6. **If the app ever runs outside Vercel, stop trusting `x-forwarded-for` as sent.**
   Why: rate limiting keys on the first entry of that header (`src/lib/rate-limit.ts`). Vercel sets it, but behind another host a client can send its own value and get a fresh limit on every request, and without it (or `x-real-ip`) all clients share one bucket. Read the client IP from a header your own proxy controls.

7. **Decide whether the link's rate limit should fail closed.**
   Why: `isRateLimited()` lets requests through when its database call fails (comment in `src/lib/rate-limit.ts`), so the limits switch off during a database error.

8. **Upgrade Next.js from the pinned 16.4.3.**
   Why: it was pinned because pnpm's release-age policy rejected 16.4.4 on its release day; upgrade once the cutoff has passed (D-022).

9. **Email or SMS notifications when a quote is ready and when the car is ready.**
   Why: the link shows live status, but customers still have to open it; a message would cut the "is my car ready?" calls further (PRD §1). Left out of the trial on purpose (PRD §9).

10. **A staff accounts screen: add, deactivate, change password.**
    Why: accounts are created by script only and there is no screen to add a mechanic, deactivate one who leaves (`profiles.active`) or change a password; today that means the Supabase dashboard or a script (PRD §9).

11. **Filter the jobs list in the database.**
    Why: the "Open" filter on `/jobs` filters the full list in memory; add a status filter to `listJobs` before the list grows past a few hundred jobs (`shortcut:` in `src/app/(staff)/jobs/page.tsx`).

## Later

12. **Invoices and PDF quotes, then payments.**
    Why: invoicing happens outside the app today; each approved quote is already stored as an immutable version with every line (`job_quotes`, D-049), so a PDF needs no new money logic. Left out of the trial on purpose (PRD §9).

13. **Audit export.**
    Why: the timeline (`job_events`) and the quote versions (`job_quotes`) are the evidence in a dispute, but today they can only be read on the job page; an owner-only export per job or per month would make them easy to hand over.

14. **Database limits for the settings text.**
    Why: garage name, address and phone lengths are checked in the server action only, not in the database (D-070, D-072); add CHECK constraints if a second write path appears.

15. **Run the settings e2e test on the phone viewport too.**
    Why: it runs on desktop only because both Playwright projects share the one settings row and would race (`shortcut:` in `e2e/settings.spec.ts`, D-072).

## Known limits we accepted

These are deliberate. They are listed so nobody is surprised.

- **A signed-out staff member looks like the customer.** Approve and Decline refuse a signed-in staff session, but someone who opens the link in a private window cannot be told apart from the customer. IP addresses and device fingerprints are not stored, for GDPR reasons. The controls are the token, the version-bound event and the staff audit trail (D-067).
- **Staff who create a link hold the raw token.** That is the point: they send it to the customer. It is shown once and can be revoked at any time (D-042).
- **The link never expires.** A forwarded link stays valid until staff revoke it. This was the client's decision (D-053).
- **Mechanics see the whole customer and vehicle directory**, so they find an existing car instead of creating a duplicate. Jobs stay per mechanic (D-054).
- **The CSP allows inline styles** (`style-src 'unsafe-inline'`), because React injects them. No user HTML is ever rendered, so the remaining risk is CSS only (D-043).
- **Supabase advisor warnings on `transition_job`, `create_job_link` and `revoke_job_link` are expected.** They are the only write path for status, links and quotes, and each checks the caller before it reads anything (D-064).
