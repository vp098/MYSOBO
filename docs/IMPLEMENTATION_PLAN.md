# MySobo — Implementation plan for launch (1 Jan 2027)

This document lists what goes into the MySobo app before launch: the brand
colours, the language switch, the install-to-home-screen app, and the three
dashboards. It is the checklist the team builds and tests against.

Reference mockups (layout only — **colours come from the MySobo palette below,
not from the mockups**, which use teal and royal blue):

| Dashboard | Route | Reference |
|---|---|---|
| Resident app | `/mysobo` | sites.google.com/view/mysobo-resident-application |
| Business owner portal | `/mysobo/owner` | sites.google.com/view/mysobobusinessownerportal |
| Super admin portal | `/mysobo/superadmin` | sites.google.com/view/dewfcedfc |

Timetable: coding 27 Nov – 16 Dec · internal testing 17 – 20 Dec · beta
21 – 27 Dec · final fixes 28 – 30 Dec · freeze 31 Dec · go live 1 Jan.

---

## 1. Brand colours ("Green to trust. Marigold to welcome.")

All colours are CSS variables in `frontend/src/styles.css`. Components never
use raw hex values; they use the role variables.

| Role | Name | Hex | Used for |
|---|---|---|---|
| Primary | Leaf Green | `#2B7A4B` | Logo, main buttons (Call, Search), selected states, active sidebar item |
| Accent | Marigold | `#F2A33A` | Offers, "new", the add button, the dot in "mysobo." — **dark text only** |
| Base | Mint Cream | `#EAF8ED` | Hero areas, panels, selected chips |
| Support | Indigo | `#2E3A8C` | Links and info only |
| Support | Haldi Cream | `#FCE7C4` | Offer cards, warning badges |
| Text | Ink | `#1A231C` (secondary `#4A544C`) | All text |
| Background | Paper | `#FCFEFB` (lines `#DCEBDF`) | Page background, card borders |

**How much of each:** 60% Paper · 22% Mint · 10% Green · 5% Marigold · 3% Indigo.

**Status colours:** success `#E4F4E8` / `#0F3A22` · warning `#FCE7C4` / `#3A2200`
· error `#FCE4E2` / `#B3261E` · info `#E3E6FA` / `#141A4D`.

**Readable pairs (WCAG 4.5:1):** white on green ✓ · ink on marigold ✓ ·
deep green on mint ✓ · ink on paper ✓ · indigo on white ✓ ·
**white on marigold ✗ never**.

**Mapping from the mockups:**
- Mockup teal/blue primary buttons → Leaf Green.
- Mockup navy/black "selected" pills → Leaf Green fill, white text.
- Mockup "Pro" purple badge → Indigo container; "Premium" dark card → Green 20 (`#0F3A22`).
- Mockup orange "Pending" → Haldi Cream badge with dark marigold text.
- Mockup blue "Create account" → Leaf Green; "+ Add business" → Marigold with ink text.

## 2. Language

- The whole app opens in **Gujarati** by default.
- Top bar shows a **globe icon button**. Clicking it opens a small menu:
  **ગુજરાતી · English · हिंदी**, each written in its own script, with a tick on the current one.
- The choice is saved on the device (`localStorage`, key `mysobo-lang`) and sets `<html lang>`.
- Every visible string goes through `t()` in `frontend/src/i18n.tsx` with
  `[English, Gujarati, Hindi]` entries. **Super admin screens are English-only today** and must move to `t()`.
- Business names, addresses and owner-entered text are shown as entered (not translated).
- Fonts: Rasa / Hind Vadodara / Baloo Bhai 2 for Gujarati, Martel / Hind / Baloo 2 for Hindi.

## 3. Install as an app ("widget") → opens `/mysobo`

MySobo is an installable web app (PWA). Anyone who opens the shared link can
add it to their phone's home screen; the icon always opens **`/mysobo`**.

- `public/manifest.webmanifest`: name "MySobo", `start_url: "/mysobo"`,
  `scope: "/"`, `display: "standalone"`, theme `#2B7A4B`, background `#FCFEFB`,
  icons 192, 512 and a 512 maskable icon.
- `public/sw.js`: a small service worker that caches the app shell so it opens
  fast and shows an offline message; API calls always go to the network.
- **Install button** in the top bar menu (Android/Chrome uses the browser's
  install prompt; iPhone shows "Share → Add to Home Screen" steps).
- Share link and QR code: `https://<domain>/mysobo`.
- Optional after launch: Play Store listing as a Trusted Web Activity.

## 4. Shared layout

- **Top bar:** logo `mysobo.` (green, marigold dot) · area chip "South Bopal · Ahmedabad" ·
  globe language menu · Saved (residents) · Log in / profile.
- **Owner and admin portals** use a dashboard layout: left sidebar (collapses to a
  bottom/drawer menu on phones), breadcrumb, page title, content cards.
- Cards: white on Paper, 1px `#DCEBDF` border, 16–20px radius, soft green shadow.
- KPI tiles: label, big number, short helper line, small tinted icon.
- Badges: Verified (mint), Pending (haldi), Rejected (error), Pro (indigo), Premium (green 20).
- Every list has an empty state (with a mascot) and a loading state.
- Mobile first: everything must work at 360px width.

## 5. Dashboard 1 — Resident app (`/mysobo`)

| Section | Contents | Status |
|---|---|---|
| Hero | "વિશ્વસનીય મદદ, ઘરની નજીક." headline, search box (name, description, area, phone, category), type filter **All / Services / Products** | Exists — restyle |
| Browse categories | Category cards with icon, short description, "N active" count | Exists |
| Featured listings | Cards: category tag, Verified badge, name, description, rating (★ 4.9 (38)), price from | Exists — add rating + price line |
| Category page | `/services/:slug`, `/products/:slug`: subcategory chips, filters, paginated results | Exists |
| Business detail | `/business/:slug`: Call (green), WhatsApp (mint), Save, details, hours, photos, offers, reviews | Exists — add offers + hours |
| Saved | Saved businesses list with count in top bar | Partly — add top-bar Saved chip |
| Login | Dialog with mobile OTP | Exists |

## 6. Dashboard 2 — Business owner portal (`/mysobo/owner`)

Signed-out view: left side explains the benefits (Trusted local discovery,
Products & services, Offers & plan upgrades) and the 5-step journey
(Create account → Business type → Choose plan → Create listing → Photos & submit);
right side has **Create account / Sign in** tabs. "Already listed? Claim an existing business."

Signed-in sidebar: **Overview · My Businesses · Add Business · Claim Business ·
Offers & Promotions · Plans & Billing · Profile & Settings · Help & Support · Log out**.

| Page | Contents | Backend |
|---|---|---|
| Overview | "Welcome back, {name}", KPI tiles (Total, Verified, Under review, Pending claims, Pending offers, Current plan), quick actions, listings with status badges, recent activity | Businesses, Claim, BusinessPost, Subscription — exists; needs an owner summary endpoint |
| My Businesses | Search + type + status filters, cards with plan badge, status, "Hidden from public search" flag, Edit / Manage | Exists |
| Add Business | Step form: type, category & subcategory, details, contact, hours, photos | Exists (single form) — split into steps |
| Claim Business | Search existing listing, submit claim with proof | Exists |
| Offers & Promotions | Post an offer (business, title ≤200, details) + submitted offers with Pending / Approved / Rejected | Post exists; admin approval needed |
| Plans & Billing | Free / Pro ₹499 / Premium ₹1,999 cards per business, current plan, request upgrade, request history | Exists |
| Profile & Settings | Name, mobile, email, language | New (small) |
| Help & Support | FAQ, WhatsApp support link | New (static) |

## 7. Dashboard 3 — Super admin portal (`/mysobo/superadmin`)

Top bar: global search, date, notifications, admin profile.

Sidebar: **Overview · Business Claim Requests · Business Verification ·
All Businesses · Categories & Subcategories · Products & Services ·
Offers & Promotions · Plan & Subscription Requests · Pricing Management ·
Payments & Invoices · Reports & Complaints · Admin Activity / Audit Log · Settings**.
Pending counts show as marigold badges.

| Page | Contents | Backend |
|---|---|---|
| Overview | Welcome, quick buttons (Review claims, Verification queue, Field entry / CSV), 8 KPI tiles (Total businesses, Pending claims, Verified, Awaiting verification, Rejected claims, Active subscriptions, Pending plan requests, Total payments ₹), two-stage workflow strip, recent claims, awaiting verification, recently verified, recent admin activity | Data exists; needs an admin summary endpoint |
| Claim requests | List with claimant, phone, evidence files, status; Review → approve / reject | Claim — exists |
| Business verification | Level 0 → 1 → 2 queue, Inspect & Verify | Exists |
| All businesses | Search, filters, edit, hide/show, field-agent entry, CSV import | Exists |
| Categories & subcategories | Nested tree, type, order, icon, image, active | Exists |
| Products & services | Per-business catalogue moderation | Exists in data — new screen |
| Offers & promotions | Approve / reject owner offers | **New** endpoint + screen |
| Plan requests | Approve / reject upgrade requests | Exists |
| Pricing | Edit Free / Pro / Premium prices | Exists |
| Payments & invoices | Record payment, list payments, invoice | Exists |
| Reports & complaints | Resident reports, resolve | Report model exists — new screen |
| Audit log | Who did what, when | AuditLog exists — new screen |
| Settings | App settings | AppSetting exists |

## 8. Build order (coding 27 Nov – 16 Dec)

| Dates | Work |
|---|---|
| 27 – 28 Nov | This doc · globe language menu · installable app (manifest, icons, service worker, install button) |
| 29 Nov – 3 Dec | Resident app restyle to the reference layout; ratings, price, offers on detail page |
| 4 – 7 Dec | Owner portal: dashboard layout, sidebar, Overview KPIs, My Businesses, Plans, Offers |
| 8 – 10 Dec | Super admin: dashboard layout, sidebar, Overview KPIs, queues, offers approval, reports, audit log |
| 11 – 12 Dec | Owner and admin pages left over; admin strings into Gujarati/Hindi |
| 13 – 14 Dec | Polish: mascots in empty states, 360px mobile pass, contrast check |
| 15 Dec | Safety: OTP rate limits, permissions, error tracking, backups |
| 16 Dec | Buffer and feature freeze |

## 9. Done when

- [ ] App opens in Gujarati; globe menu switches to English and Hindi on every screen, and the choice survives a reload.
- [ ] No white text on marigold anywhere; every text pair passes 4.5:1.
- [ ] Installed app opens `/mysobo` on Android and iPhone.
- [ ] Owner can sign up, add or claim a business, post an offer and request a plan from the dashboard.
- [ ] Admin can approve claims, verify listings, approve offers and plans, record payments, and see the audit log.
- [ ] All screens work at 360px width.
- [ ] `npm run build` and the backend test suite pass in CI.
