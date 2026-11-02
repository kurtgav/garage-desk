# Next steps

What to do if Garage Desk goes into real daily use, most urgent first. Each item has one line on why. D-ids point to [DECISIONS.md](DECISIONS.md). Updated after Phase 5 and the independent QA audit of 3 Nov; items closed since then are listed under "Done" at the end.

## Now (before real customers use it)

1. **Delete `CREDENTIALS.local.md` once the credentials are posted.**
   Why: it holds every staff password in plain text; it is gitignored but still sits on a laptop (`scripts/generate-credentials.ts`).

2. **After onboarding, have everyone set their own password, then remove the `SEED_*_PASSWORD` values from Vercel.**
   Why: the demo passwords are shared in the client channel (PRD §11) and are also stored in the Vercel Production env at the client's request, where anyone with access to the project can read them; the app never reads them at runtime. Each person changes theirs on `/profile`, and the owner can reset a mechanic's on `/staff`. Do not re-run the seed for this: it deletes every customer, vehicle and job.

3. **Move to the EU: a new Supabase project in `eu-central-1`, and Vercel functions in `fra1`.**
   Why: the database and the functions run in Tokyo today, so every request from Sofia makes a long round trip, and customer names, phones and plates are stored outside the EU (D-066). This needs a new Supabase project, so it is the client's decision; we only have access to the current project. Move both together, or every query crosses continents. Steps: create the project, apply `supabase/migrations/` (they also create the `avatars` bucket), move the data, apply the Auth settings listed in D-065 (sign-up off, password policy, site URL), update the Vercel env vars, then set `regions` in `vercel.json` to `fra1`.

4. **Custom SMTP for staff password-reset emails.**
   Why: production cannot send them yet, because Supabase's built-in mailer reaches only the project team and the free tier refuses template changes (D-086). Until then a mechanic asks the owner, and an owner who forgets their password needs the administrator. Steps:
   - Set up an SMTP provider (for example Resend or Postmark) in the Supabase project's Auth settings.
   - Apply `supabase/templates/recovery.html` with the subject "Reset your Garage Desk password" through the Management API (`PATCH /v1/projects/{ref}/config/auth`, see D-086).
   - Set `PASSWORD_RESET_EMAIL` to `on` in the Vercel Production env and redeploy.
   - Give staff real email addresses: the demo accounts use `@garagedesk.test`, which receives no mail.

5. **Turn on automatic deploys: Vercel Git deployments, or a deploy job in CI.**
   Why: production is deployed by hand with `vercel deploy --prod --force` from a `git archive` (D-073, D-075, D-089), and migrations are pushed by hand because the CLI account has no Management API rights on the project (D-065). A merge to `main` should reach production without a laptop. First link the commit author email to the `kurtgav` Vercel account, or commit as that account: on the Hobby plan Vercel blocks deployments from commits by anyone else (D-075). Keep skipping the build cache, or check the deployed CSS, because a cached build once served a stale stylesheet (D-089).

## Soon (first weeks of use)

6. **Force a new password at the first sign-in after a temporary password.**
   Why: the owner sees every temporary password they create, and today nothing makes the person replace it; they are only asked to (D-077).

7. **A separate Supabase project for preview deployments.**
   Why: the Preview env no longer holds the service-role key, so previews have no admin access to production data. But `createAdminClient()` refuses to start without that key, and sign-in, rate limits and the customer link all use it, so a preview cannot be used for a real test. A preview project gives previews a working backend with no production data.

8. **Map Cyrillic look-alike letters in plates to Latin.**
   Why: on a Bulgarian keyboard "СА 1234 КМ" is typed in Cyrillic and stored as a different plate from the Latin "CA 1234 KM", so search misses it and the unique-plate check lets a duplicate in. Add the mapping in `normalisePlate()` (`src/lib/format.ts`, marked `shortcut:`) and in the database trigger `private.normalise_vehicle`, then re-normalise existing plates in a migration.

9. **If the app ever runs outside Vercel, stop trusting `x-forwarded-for` as sent.**
   Why: rate limiting keys on the first entry of that header (`src/lib/rate-limit.ts`). Vercel overwrites it with the real client IP (D-087), but behind another host a client can send its own value and get a fresh limit on every request, and without it (or `x-real-ip`) all clients share one bucket. Read the client IP from a header your own proxy controls.

10. **Decide whether the rate limits should fail closed.**
    Why: `isRateLimited()` lets requests through when its database call fails (comment in `src/lib/rate-limit.ts`), so the limits switch off during a database error.

11. **Upgrade Next.js from the pinned 16.4.3.**
    Why: it was pinned because pnpm's release-age policy rejected 16.4.4 on its release day; upgrade once the cutoff has passed (D-022).

12. **Email or SMS notifications to customers when a quote is ready and when the car is ready.**
    Why: the link shows live status, but customers still have to open it; a message would cut the "is my car ready?" calls further (PRD §1). Left out of the trial on purpose (PRD §9). The SMTP set up in item 4 could carry the email part.

13. **Filter the jobs list in the database.**
    Why: the "Open" filter on `/jobs` filters the full list in memory; add a status filter to `listJobs` before the list grows past a few hundred jobs (`shortcut:` in `src/app/(staff)/jobs/(list)/page.tsx`).

14. **Optional: a "Sign out everywhere" button.**
    Why: "Sign out" now ends only the session on the device in use. Today a lost phone is signed out only when the person changes their password (which signs out their other sessions, D-079) or the owner deactivates them.

## Later

15. **Invoices and PDF quotes, then payments.**
    Why: invoicing happens outside the app today; each approved quote is already stored as an immutable version with every line (`job_quotes`, D-049), so a PDF needs no new money logic. Left out of the trial on purpose (PRD §9).

16. **Audit export.**
    Why: the timeline (`job_events`) and the quote versions (`job_quotes`) are the evidence in a dispute, but today they can only be read on the job page; an owner-only export per job or per month would make them easy to hand over.

17. **A sliding-window rate limiter, if abuse appears.**
    Why: the fixed one-minute window lets up to twice the limit through across a window boundary. That is acceptable for 60 views a minute today (D-012).

18. **Database limits for the settings text.**
    Why: garage name, address and phone lengths are checked in the server action only, not in the database (D-070, D-072); add CHECK constraints if a second write path appears.

19. **Run the settings e2e test on the phone viewport too.**
    Why: it runs on desktop only because both Playwright projects share the one settings row and would race (`shortcut:` in `e2e/settings.spec.ts`, D-072).

20. **Page through Auth users on `/staff` past 1,000 accounts.**
    Why: the staff list reads one page of 1,000 Auth users (`shortcut:` in `src/lib/data/staff.ts`); a garage will not reach that, but a multi-garage version would.

21. **Demo data seeded at the very start of a month.**
    Why: the seed places "collected this month" jobs inside this month's workshop hours; if the month has had none yet (the 1st before 08:00, or a weekend start), those times fall outside hours (`shortcut:` in `scripts/seed.ts`). Demo only.

## Known limits we accepted

These are deliberate. They are listed so nobody is surprised.

- **A signed-out staff member looks like the customer.** Approve and Decline refuse a signed-in staff session, but someone who opens the link in a private window cannot be told apart from the customer. IP addresses and device fingerprints are not stored, for GDPR reasons. The controls are the token, the version-bound event and the staff audit trail (D-067).
- **Staff who create a link hold the raw token.** That is the point: they send it to the customer. It is shown once and can be revoked at any time (D-042).
- **The link never expires.** A forwarded link stays valid until staff revoke it. This was the client's decision (D-053).
- **Mechanics see the whole customer and vehicle directory**, so they find an existing car instead of creating a duplicate. Jobs stay per mechanic (D-054).
- **The CSP allows inline styles** (`style-src 'unsafe-inline'`), because React injects them. No user HTML is ever rendered, so the remaining risk is CSS only (D-043).
- **Supabase advisor warnings on `transition_job`, `create_job_link` and `revoke_job_link` are expected.** They are the only write path for status, links and quotes, and each checks the caller before it reads anything (D-064).
- **No leaked-password check at sign-in.** Supabase offers the HaveIBeenPwned check only on the Pro plan (the advisor flags it). Sign-up is off, passwords need 12+ characters with lower, upper and digits, the seed passwords are random 20-character strings, and sign-in is rate-limited. Turn the check on if the project moves to Pro.
- **A reset link can be used up by a mail scanner.** Some mail filters open links to check them, which spends the one-time token; the person then requests a new link (D-079). This only matters once reset emails are on (item 4).
- **A deactivated person's open jobs are not moved automatically.** They stay assigned to that person, and the dashboard shows them on a card marked "Inactive · reassign" until the owner reassigns each job (D-077, D-092, D-095).

## Done

- ~~A staff accounts screen: add, deactivate, change password.~~ Delivered in Phase 5: the owner manages staff on `/staff`, and everyone edits their own profile and password on `/profile` (D-077, D-084).
