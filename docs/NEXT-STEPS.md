# Next steps

What to do if Garage Desk goes into real daily use, most urgent first. Each item has one line on why. D-ids point to [DECISIONS.md](DECISIONS.md). Updated on 3 Nov after the NEXT-STEPS round; items closed since Phase 5 are listed under "Done" at the end.

## Now (before real customers use it)

1. **Delete `CREDENTIALS.local.md` once the credentials are posted.**
   Why: it holds every staff password in plain text; it is gitignored but still sits on a laptop (`scripts/generate-credentials.ts`). `userguide.pdf` holds the same passwords: share it privately, then delete the local copy too.

2. **After onboarding, have everyone set their own password, then remove the `SEED_*_PASSWORD` values from Vercel.**
   Why: the demo passwords are shared in the client channel (PRD §11) and are also stored in the Vercel Production env at the client's request, where anyone with access to the project can read them; the app never reads them at runtime. Each person changes theirs on `/profile`. Accounts the owner creates or resets on `/staff` must already choose their own at first sign-in (D-106); the four seed accounts are not forced. Do not re-run the seed for this: it deletes every customer, vehicle and job.

3. **Move to the EU: a new Supabase project in `eu-central-1` (Frankfurt), and Vercel functions in `fra1`.**
   Why: the database and the functions run in Tokyo today, so every request from Sofia makes a long round trip, and customer names, phones and plates are stored outside the EU (D-066). Supabase cannot move a project between regions, so this is a new project. **Blocked on access:** the access token in `.env.local` reaches only the current project (it sees no organization), so creating one returns 403. With a token from the account that owns the Supabase organization, the move is about half an hour: create the project, apply `supabase/migrations/` (they also create the `avatars` bucket), copy the Auth and API settings from the Tokyo project, seed it (production holds only demo data today; move real data instead once the garage uses it), point `.env.local`, the Vercel env vars and the `SUPABASE_DB_URL` GitHub secret at it, set `regions` in `vercel.json` to `fra1`, push. Keep the Tokyo project until the EU one is verified, then pause or delete it.

4. **Move to paid plans before the garage relies on it: Supabase Pro and Vercel Pro.**
   Why: the Supabase free plan has no automatic backups, so a mistake or an incident can lose every job, and it pauses a project after about a week without use. Pro adds daily backups and the leaked-password check (see Known limits). Vercel's terms allow Hobby only for personal, non-commercial use, and a garage running its business on it is commercial.

5. **Custom SMTP for staff password-reset emails.**
   Why: production cannot send them yet, because Supabase's built-in mailer reaches only the project team and the free tier refuses template changes (D-086). Until then a mechanic asks the owner, and an owner who forgets their password needs the administrator. Steps:
   - Set up an SMTP provider (for example Resend or Postmark) in the Supabase project's Auth settings.
   - Apply `supabase/templates/recovery.html` with the subject "Reset your Garage Desk password" through the Management API (`PATCH /v1/projects/{ref}/config/auth`, see D-086).
   - Set `PASSWORD_RESET_EMAIL` to `on` in the Vercel Production env and redeploy.
   - Give staff real email addresses: the demo accounts use `@garagedesk.test`, which receives no mail.

## Soon (first weeks of use)

6. **A separate Supabase project for preview deployments.**
   Why: the Preview env does not hold the service-role key, so previews have no admin access to production data. But `createAdminClient()` refuses to start without that key, and sign-in, rate limits and the customer link all use it, so a preview cannot be used for a real test. A preview project gives previews a working backend with no production data. The free plan allows two projects per organization, so this waits for item 3 to finish (and the Tokyo project to go) or for item 4.

7. **Upgrade Next.js from the pinned 16.4.3.**
   Why: it was pinned because pnpm's release-age policy rejected 16.4.4 on its release day; upgrade once the cutoff has passed (D-022). 16.4.4 passes the one-day cutoff on 3 Nov at about 10:50 UTC. Check the diff afterwards: pnpm 11 `add` of a version still inside the cutoff installs it anyway and writes `minimumReleaseAgeExclude` entries into `pnpm-workspace.yaml`, which switches the policy off for those packages. Never commit those entries.

8. **Email or SMS notifications to customers when a quote is ready and when the car is ready.**
   Why: the link shows live status, but customers still have to open it; a message would cut the "is my car ready?" calls further (PRD §1). Left out of the trial on purpose (PRD §9). The SMTP set up in item 5 could carry the email part.

9. **If the app ever runs outside Vercel, stop trusting `x-forwarded-for` as sent.**
   Why: rate limiting keys on the first entry of that header (`src/lib/rate-limit.ts`). Vercel overwrites it with the real client IP (D-087), but behind another host a client can send its own value and get a fresh limit on every request, and without it (or `x-real-ip`) all clients share one bucket. Read the client IP from a header your own proxy controls.

## Later

10. **Invoices and PDF quotes, then payments.**
    Why: invoicing happens outside the app today; each approved quote is already stored as an immutable version with every line (`job_quotes`, D-049), so a PDF needs no new money logic. Left out of the trial on purpose (PRD §9).

11. **Audit export.**
    Why: the timeline (`job_events`) and the quote versions (`job_quotes`) are the evidence in a dispute, but today they can only be read on the job page; an owner-only export per job or per month would make them easy to hand over.

12. **A sliding-window rate limiter, if abuse appears.**
    Why: the fixed one-minute window lets up to twice the limit through across a window boundary. That is acceptable for 60 views a minute today (D-012).

## Known limits we accepted

These are deliberate. They are listed so nobody is surprised.

- **A push to `main` goes live without waiting for CI.** Vercel deploys every push to `main` within about two minutes; the CI tests run on the same push but do not hold the deploy back. Run the local gate (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`) before pushing (D-105).
- **A migration the new code needs must reach production first.** CI applies migrations as soon as `main` is pushed, usually before Vercel's build finishes, but that is a race. When new code cannot run without its migration, push the migration commit first (or apply it from a clean worktree), then the code (D-105).
- **A signed-out staff member looks like the customer.** Approve and Decline refuse a signed-in staff session, but someone who opens the link in a private window cannot be told apart from the customer. IP addresses and device fingerprints are not stored, for GDPR reasons. The controls are the token, the version-bound event and the staff audit trail (D-067).
- **Staff who create a link hold the raw token.** That is the point: they send it to the customer. It is shown once and can be revoked at any time (D-042).
- **The link never expires.** A forwarded link stays valid until staff revoke it. This was the client's decision (D-053).
- **Mechanics see the whole customer and vehicle directory**, so they find an existing car instead of creating a duplicate. Jobs stay per mechanic (D-054).
- **The CSP allows inline styles** (`style-src 'unsafe-inline'`), because React injects them. No user HTML is ever rendered, so the remaining risk is CSS only (D-043).
- **Supabase advisor warnings on `transition_job`, `create_job_link`, `revoke_job_link` and `set_staff_active` are expected.** They are the only write path for status, links, quotes and staff activation, and each checks the caller before it reads anything (D-064, D-077).
- **No leaked-password check at sign-in.** Supabase offers the HaveIBeenPwned check only on the Pro plan (the advisor flags it). Sign-up is off, passwords need 12+ characters with lower, upper and digits, the seed passwords are random 20-character strings, and sign-in is rate-limited. Turn the check on with item 4.
- **A reset link can be used up by a mail scanner.** Some mail filters open links to check them, which spends the one-time token; the person then requests a new link (D-079). This only matters once reset emails are on (item 5).
- **A deactivated person's open jobs are not moved automatically.** They stay assigned to that person, and the dashboard shows them on a card marked "Inactive · reassign" until the owner reassigns each job (D-077, D-092, D-095).
- **The rate limits fail closed.** When the limiter's database call fails, sign-in, password and customer actions are refused with "Something went wrong. Please try again." instead of running unlimited (D-100). Those actions need the database anyway.

## Done

- ~~A staff accounts screen: add, deactivate, change password.~~ Delivered in Phase 5: the owner manages staff on `/staff`, and everyone edits their own profile and password on `/profile` (D-077, D-084).
- ~~Turn on automatic deploys.~~ Every push to `main` deploys production from Git (commits by `kurtgav`, no build cache), and CI applies new migrations at push time (D-105).
- ~~Force a new password at the first sign-in after a temporary password.~~ A mechanic the owner adds, or whose password the owner resets, must choose their own on `/set-password` before anything else opens (D-106).
- ~~A "Sign out everywhere" button.~~ On `/profile`: it ends every session of the account, this device included (D-107).
- ~~Map Cyrillic look-alike letters in plates to Latin.~~ `normalisePlate()` and the database use the same mapping; Cyrillic and Latin plates are one plate for search and the unique check (D-099).
- ~~Decide whether the rate limits should fail closed.~~ They do (D-100).
- ~~Filter the jobs list in the database.~~ `listJobs` filters by status in SQL; the "Open" tab no longer filters in memory.
- ~~Database limits for the settings text.~~ CHECK constraints match the form limits (D-101).
- ~~Page through Auth users on `/staff` past 1,000 accounts.~~ The staff list reads every page.
- ~~Demo data seeded at the very start of a month.~~ Demo times stay in workshop hours on the 1st and on weekend starts (D-102).
- ~~Run the settings e2e test on the phone viewport too.~~ Both Playwright projects run it and take turns through the settings file lock (D-108).
