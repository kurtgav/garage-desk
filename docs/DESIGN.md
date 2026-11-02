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
