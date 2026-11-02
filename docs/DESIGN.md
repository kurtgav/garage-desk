# Design system — Garage Desk

Requested by the client on 2 Nov: the UI must match a reference SaaS dashboard (light, neutral, "floating app frame" style). This file turns that reference into tokens and a page map. The reference's *visual language* is copied exactly; its *content* is mapped to real Garage Desk features. Controls that would do nothing here (AI assistant, notifications, plan/upgrade) are not added — their slots hold real features instead.

## Visual language

- **Canvas:** page background light cool gray `#EBECEE`. The staff app sits in one **floating frame** (white-ish, `rounded-[28px]`, 1px border `#E4E4E7`, very soft shadow) with ~24px margin on desktop; edge-to-edge on tablet/phone.
- **Sidebar** (inside the frame, left, ~264px): background `#F7F7F8`, right border `#EEEEF0`. Logo row on top (black rounded-square mark + "Garage Desk" semibold) with a collapse icon button on the right. Nav groups each start with a muted section label (`#A1A1AA`, 13px) preceded by a small dashed-circle glyph. Items: 15px, icon 18px outline (lucide, stroke 1.5), 40px tall, radius 10px; active item = `#EDEDEF` background, `#18181B` text, filled/darker icon. Right-aligned count pills: blue (`bg #E0EDFF`, text `#2563EB`) or green (`bg #DCFCE7`, text `#15803D`), 12px, rounded-full.
- **Sidebar bottom:** a white info card (border `#ECECEE`, radius 14px) + full-width light button; then the signed-in user (avatar circle with initials, name 14px medium, email 13px muted, chevron → menu with "Sign out").
- **Top bar** (main area, 64px, bottom border `#EEEEF0`): left = page icon + page title (breadcrumb style, 16px, `#3F3F46`); right = search input (white, border `#E4E4E7`, radius 10px, magnifier icon, placeholder "Search customers, phones, plates…") and a secondary outline button.
- **Content:** main background `#FAFAFA`, padding 40px desktop / 16px phone, max content width ~1360px.
- **Page header:** H1 30px semibold `#18181B` ("Welcome back, Georgi!" on the dashboard; the page name elsewhere), subtitle 16px `#71717A`. Right side: date pill (outline button with calendar icon, today in Europe/Sofia) + **primary button = black** (`#18181B`, white text, radius 10px, 44px, plus icon).
- **KPI cards (nested):** outer card `#F4F4F5`, radius 16px, padding 6px; inner white card (border `#ECECEE`, radius 12px) holding a small icon tile (white, border, radius 8px, 28px) + label 16px `#52525B` + value 32px medium tabular-nums; under the inner card a footer row 14px: delta/secondary text in green `#16A34A`, red `#DC2626` or muted, with small dashed-circle glyphs left/right.
- **Section cards:** white, border `#ECECEE`, radius 16px, padding 16–20px. Title 20px medium; right-aligned underlined text link ("View all").
- **Tables:** header row background `#F4F4F5`, radius 10px, 14px `#71717A` labels; body rows ~56px, 15px `#27272A`, divider `#F0F0F2`; first column = small colored icon square (20px, radius 6px, tinted by status) + name; numbers tabular-nums; time cells with a clock icon; status = pill (rounded-full, 13px, tinted background); actions = quiet text buttons ("View", "Edit") + icon button.
- **Status pills (tinted, AA text):** new zinc, quoted blue, declined rose, approved indigo, in_progress amber, ready green, collected neutral outline, cancelled neutral outline/strikethrough-free muted. Same tones in table pills and badges.
- **Cards grid (bottom of dashboard):** 4 white cards with a light gray illustration area (`#F4F4F5`, radius 12px) and a corner status label, then title 17px medium, meta line 14px muted with "•" separators, and a footer row of small icon chips + a right pill (e.g. "3 open").
- **Typography:** Inter (next/font, self-hosted), tabular numbers for money/counts. Text colors: primary `#18181B`, secondary `#52525B`/`#71717A`, muted `#A1A1AA` (decorative/labels only — never for body text below 18px on white, AA).
- **Interaction:** hover rows `#FAFAFA`→`#F4F4F5`; focus ring 2px `#18181B`/30% offset 2px; buttons press scale .98; transitions 150ms ease-out. No gradients, no heavy shadows.

## Page map (reference slot → Garage Desk)

| Reference | Garage Desk |
|---|---|
| Logo "FlowAI" | Wordmark "Garage Desk" |
| Section "Workspaces": Dashboard, Workflow Library (28), Canvas, Templates, Analytics, Team (35+), Integrations | Section "Workshop": Dashboard (owner), Jobs (blue pill = open jobs), Ready for collection (green pill = ready count, links to `/jobs?status=ready`), Customers |
| Section "Agent Managements": Settings, Help, Appearance | Section "Garage": Settings (owner) |
| Section "Workflow Runs" (recent items, star) | "Recent jobs": last 4 jobs the viewer can see (colored square + ref · plate), links |
| Usage card "891/1000 · Upgrade" | "Revenue this month (net)" (owner) or "My open jobs" (mechanic) + button "View dashboard"/"View my jobs" |
| User card | Signed-in staff (name, email, role), menu with Sign out |
| Top bar "Dashboard" + search + Ask AI + bell | Page title + global search (→ `/customers?q=`) + "New job" outline button. No AI, no bell. |
| "Welcome Back, Jane!" + date + "Created Workflow" | "Welcome back, {first name}!" + "Here's the workshop today." + date pill + **New job** (black) |
| KPI: Total Runs / Success Rate / Active Workflows / AI Tokens | Revenue this month (net) / Open jobs / Awaiting approval (quoted) / Ready for collection — footers show real secondary facts (e.g. "5 jobs collected this month", "2 declined need a new quote"), no invented deltas |
| Table "Active Workflows" | "Ready for collection" (ref, customer, plate, total, waiting with clock, status pill, View) |
| "Recent Using Templates" cards | "Mechanic workload": one card per mechanic (open count, status chips) |
| Jobs list / customers / settings | Same shell; lists use the table style; detail pages use section cards |

The customer link page (`/[token]`) is outside the staff frame: same canvas, tokens and card style, single column, mobile-first (375px).

## Must not change

Test ids, accessible names and button labels used by the e2e suite; RLS-driven visibility (mechanics never see owner-only items); AA contrast; keyboard navigation; no horizontal scroll at 375px.

## Roles: what each one sees (RBAC checklist, Phase 5)

The database is the boundary (RLS, column grants, owner-only server code); this table is the cosmetic layer on top. Every role decision is made on the server while rendering (`requireOwner()`, `staff.role`, `job.can.*`), so a mechanic never receives owner controls in the HTML, not even for a moment. Owner-only pages answer a mechanic with the generic 404 and the title "Page not found" (role-aware `generateMetadata`), the same as an unknown URL.

| Page / area | Owner | Mechanic |
|---|---|---|
| Sidebar, Workshop | Dashboard, Jobs (open count), Ready for collection, Customers | Jobs, Ready for collection, Customers (counts are their own jobs) |
| Sidebar, Garage | Staff, Settings | not shown |
| Sidebar, Recent jobs | last 4 jobs | last 4 of their own jobs |
| Sidebar info card | Revenue this month (net) → dashboard | My open jobs → `/jobs` |
| User card and menu | photo or initials, name, "Owner" badge; menu: email, Profile, Sign out | same, "Mechanic" badge |
| Top bar | profile link (photo or initials) below `lg` and while the sidebar is collapsed, where the user card is out of view | same |
| `/dashboard` | KPIs, ready table, mechanic workload | 404 |
| `/jobs` | all jobs, Mechanic column; empty: "No open jobs" | own jobs, no Mechanic column; empty: "No open jobs assigned to you", per status "No … jobs assigned to you" |
| `/jobs/new` | pick the mechanic | "Assigned to you" (no picker) |
| `/jobs/[id]` | everything below + Reassign, Record phone approval, Cancel job | own jobs only (others 404): status steps without Cancel, edit lines in editable statuses, Send quote, customer link |
| `/customers`, `/customers/[id]` | all customers (D-054), Delete customer (no jobs only), every job of the customer | all customers, edit customer and vehicles, no Delete; Jobs card lists only their jobs (empty: "No jobs assigned to you") |
| `/settings` | labour rate, VAT, garage details | 404 |
| `/staff` | list (photo, name, email, role, status, open jobs), Add mechanic, Reset password, Deactivate/Reactivate; never on yourself (row links to your profile), never the last active owner | 404 |
| `/profile` | own photo, name, phone, about, password; email read-only | same |

Temporary passwords (Add mechanic, Reset password) are shown once, in the dialog that produced them, with a copy button and a note to share them privately; closing the dialog discards them (D-084).

## Landing page

Public pages only: `/`, `/login`, `/forgot-password`, `/reset-password`. Requested on 2 Nov: reverse-engineer the visual language of the client's reference (https://boxinside.webflow.io, a storage-locker site) and fill it with Garage Desk's own, true content. The staff app above does not change: every landing style is an `lp-*` token or a rule scoped under `.lp` in the "Landing" section of `globals.css` (D-080).

**Tokens (reference → `globals.css`).**

| Role | Reference | Token |
|---|---|---|
| Primary / hover / pressed | `#0C6ACE` / `#003E7F` / `#00254C` | `lp-blue`, `lp-blue-hover`, `lp-blue-pressed` |
| Blue surface, blue border | `#E0EFFE`, `#AAC3DD` | `lp-surface`, `lp-border` |
| Ink, body text | `#101010`, `#606060` | `lp-ink`, `lp-body` |
| Neutrals 20 / 30 / 40 / 50 / 80 | `#F5F5F5` `#EDEDED` `#D6D6D6` `#C2C2C2` `#383838` | `lp-n20` … `lp-n80` (`#878787` used once, for the 3:1 slider buttons) |
| Display / text face | Plus Jakarta Sans 400 / Figtree 400–600 | `font-lp-display`, `font-lp-text` (next/font, self-hosted) |
| Easing | Webflow "outQuart" | `ease-lp` = `cubic-bezier(0.25, 1, 0.5, 1)` |

Contrast checked (AA): white on `lp-blue` 5.3, `lp-blue` on white 5.3, `lp-body` on white 6.3 and on `lp-n20` 5.8, `lp-blue` on `lp-surface` 4.5. Form controls keep the staff `--color-control` border (3:1); only their size (52px) and radius (16px) follow the landing (`lpControl`).

**Type scale.** h1 64px/1.2 (40px phone, 48px tablet); h2 48px/1.2 (28–40px below lg); card titles 24–32px in the display face; lead 18px/1.5 `lp-body`; body 16px/1.5. Buttons: pills (`rounded-full`), 52px or 59px tall, Figtree 600 17–18px (`lpButton`).

**Shapes.** Cards 24px radius, large panels 32px, inner fragments 16–20px, pills 100px. Page width 1440 max with 24 / 32 / 80px gutters (`lpContainer`). Sections 80–120px apart on desktop, 64–80px on phones.

**Section map (reference slot → Garage Desk).**

| Reference | Garage Desk |
|---|---|
| Nav in the left hero column, "Book a Call" | Full-width sticky header (`LandingHeader`): transparent over the hero, white/85 + blur + hairline once scrolled (CSS transition, none with reduced motion). Wordmark, How it works / Features / Security / FAQ from 1024px (a menu below that), one account action: "Sign in", or "Open app" (role home) when signed in. Anchored sections get `scroll-margin-top` and smooth scrolling. |
| Hero: headline with an inline image tile, stats row, grey collage panel with a tilted blue card | "Quotes your customers [phone tile] approve on their phone."; facts that are true of the product (256-bit link token, 8 job statuses, VAT rounded once); collage of real app fragments with demo data, labels copied from the app (customer link panel as shown right after creating the link, GD-0099's timeline v1 quoted → declined → v2 quoted, blue quote card with net/VAT ring, the customer page, owner KPIs, ready list). Two columns from 1280px, stacked below. |
| "Featured": two-column heading, image-left rows with a quote line | "Why Garage Desk": job card from first call to keys; the quoted job and its timeline |
| Blue "How it works" band (locker pattern), white card with stepped dashed connectors, 3×2 benefit cards (hover → dark blue) | Pegboard band; six steps from intake to collection; six features |
| "Box & Prices": three product cards with specs | "Product tour": dashboard, mechanic's jobs, customer's phone, each with a short spec list and the full screenshot |
| Testimonials slider over a dotted world map, logo pill in the h2 | Security rules slider (link tokens, RLS, immutable quote versions, VAT, roles, rate limits, no secrets in the browser). No testimonials, logos, ratings, counts or prices are invented. |
| Locations: map + list | FAQ: sticky screenshot + nine questions (`<details>`) |
| Blue CTA band, white card with the name set huge, 3D object, four pills | "Run the workshop from one desk.", the phone's "ready for collection" page, four feature pills |
| Black footer | Wordmark and line, Product / Staff / Small print columns, © line |

**Motion.** The reference's Webflow interactions, reproduced in CSS: headings and cards rise 64px (100px from 1024px) and fade in over 1000ms `ease-lp` as they enter the viewport, staggered 60–90ms (`data-reveal`, `Reveal`); cards that "grow in" start at scale .85; the step connectors fill left to right. Content is visible without JavaScript and with reduced motion (D-082). Hovers: 300ms colour changes, buttons press to scale .96.

**Sign-in pages.** `AuthShell`: from 481px a white card (24px radius, 40px padding, `shadow-lp-card`: hairline ring + contact shadow + wide soft blue shadow) on `lp-n20` with the landing pegboard as faint blue dots (`.lp-auth-dots`, radial mask) around it; the card is anchored near the top (`clamp(3rem,14vh,9rem)`) so a notice opening inside it never moves the heading. Up to 480px the chrome drops away: white page, no dots, just the form. Inside: the small wordmark (→ home), a 32px display-face h1, one muted line, the form; below the card a quiet "Back to Garage Desk home" (arrow nudges on hover). One entrance: 250ms fade + 8px rise (off with reduced motion). Fields and the submit share one rectangle family: 48px, 12px radius (`lpControl`, `lpSubmit`; the submit presses to .98 and shows the spinner + `aria-busy` while pending, label unchanged). Focus is a 3px blue ring 2px off every control; the reveal toggle draws its ring inside the field. Results sit in `AuthNotice` at the top of the form: it opens by animating its height, keeps the last result while a retry is pending, and remounts the alert per result so a repeat is announced again (D-088). No product imagery here. `/login` keeps the labels "Email", "Password" and the button "Sign in" (e2e); "Forgot password?" sits on the Password label row, right-aligned. `/forgot-password` answers the same for every address, adds "No email after a few minutes? Ask the garage owner to reset your password from the Staff page." (production has no custom SMTP yet, D-079) and shows the expired-link notice for `?expired=1`. `/reset-password` lists the password rule up front and ticks each part off while typing (rules mirrored from `src/lib/password.ts`, kept in step by a unit test); a mismatch shows as soon as the confirmation stops being a prefix. Password fields use `PasswordInput` (reveal toggle, D-081).
