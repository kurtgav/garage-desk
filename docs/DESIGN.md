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

Public pages only: `/`, `/login`, `/forgot-password`, `/reset-password`, the 404. Rebuilt on 3 Nov after the client's second reference (https://zarion.webflow.io, a Webflow template; D-112). Its composition, type rhythm, tokens and motion were reverse-engineered; none of its text, pictures, logo or code is used.

**Tokens (reference → `globals.css`).**

| Role | Reference | Token |
|---|---|---|
| Accent | `#003CFF` | kept Garage Desk's `#0C6ACE` (`lp-blue`, hover `lp-blue-hover`, pressed `lp-blue-pressed`) so the page matches the app and its screenshots |
| Ink / muted | `#191814` / `#757368` | `lp-ink` / `lp-body` `#5F5D55` (darkened for 4.5:1 on cream) |
| Cream, paper, sky, cyan chip | `#F1F2E5`, `#F8F9F2`, `#E9F5FF`, `#CCF9FF` | `lp-cream`, `lp-paper`, `lp-sky`, `lp-cyan`; hairlines `lp-line` `#DCDCCF` |
| Faces | Instrument Sans 400–600, Space Mono 400 | `font-lp-display` = `font-lp-text` (Instrument Sans), `font-lp-mono` (Space Mono); next/font, self-hosted |
| Type scale | 76 / 54 / 32 / 24, 600, −2.56px on the big two; body 16/1.24 at 500 | `lpH1`, `lpH2`, `lpH3`, `lpH4` in `landing/ui.tsx` |
| Radii | 10 (buttons) / 20–24 (cards) / 999 (pills) | Tailwind arbitrary values |
| Container | 1232px | `lpContainer` (1264 incl. gutters) |
| Easing | Webflow "outQuart" | `ease-lp` = `cubic-bezier(0.25, 1, 0.5, 1)` |

**Sections (reference slot → Garage Desk).** Floating white nav pill with a dark CTA chip · dithered-landscape hero with an app card that plays one job (GD-0099: v1 declined, v2 approved) · How it works: 2×2 cream cards round a blue centre, the job's day on a progress bar, 1-tap / 2-tap cards, a wide card with a vertical marquee · Features: endless row of cream/sky cards · Tour (use cases): rows 01–06 left, screenshots stacking on the right (sticky) · Compare ("what you get back"): phone approval vs link approval · Security in the pricing geometry (link / money / staff accounts) · FAQ: numbered `<details name>` rows, one open · Closing: 76px two-line headline, second line types in, on cream slats · Footer: cream card, giant wordmark.

**Picture.** The hero and compare panel use "Sofia-vitosha-kempinski" by podoboq (CC BY 2.0, Wikimedia Commons), cropped and ordered-dithered (Bayer 8×8, five tones from paper to `lp-blue`) into `public/landing/vitosha-dither.webp`, shown with `image-rendering: pixelated`. Credited in the footer. The source photo stays out of the repo.

**Motion.** CSS only, no new dependencies (the reference uses GSAP, SplitText, ScrollTrigger and Lenis): per-word headline rise, the hero card's rows on delays, `[data-reveal]` fades via `reveal.tsx`, marquees that pause on hover/focus, sticky stacking, the closing line typing in. With reduced motion every delay is dropped and the page is shown finished.
