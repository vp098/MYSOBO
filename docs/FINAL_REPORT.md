# MySobo (SOBO) platform: final implementation and test report

Date: 28 Nov 2026 · Branch `sobo-platform` → `main` (PRs #3 to #9) · Live database: Supabase project `feyuptbciaqfiadxxdfr` (Postgres)

**Honest headline:** the code is complete and tested locally, but **production is not live yet**. The deployed backend (`mysobo-u467.vercel.app`) returns HTTP 500 on every API call because it refuses to start without its Supabase Storage settings. Google sign-in has never been configured either: there is no Google client ID locally, and the live frontend bundle was built without one. Both need configuration on Vercel (see section 10). Until then, nobody can sign in on the live site.

---

## 1. UI/UX changes (Calendly-inspired)

| Page | What changed |
|---|---|
| **Top bar (all pages)** | Full width, 68 px (60 px on phones): logo left; Explore and For businesses; on the right Install, language and an account menu (dashboard, log out), or **Log in / Sign up free** for guests. One row at every size; links collapse on phones. |
| **`/sobo` landing** | Rebuilt. The first screen fills the viewport: headline, short description, a large search with live suggestions, and **Service Based / Product Based** category chips (top 6 of each, with real listing counts) on the left. On the right, an **animated leaf illustration**: two rings of leaves orbiting at different speeds, gathering inward and out, each leaf turning, plus drifting leaves. Below the fold there are only two sections: **Browse Categories** (exactly 3 profile cards of the most recently joined businesses) and **Trusted Nearby** (6 listings, 3×2 on desktop). The old "All of South Bopal" drop-down and the extra sections (pricing, how it works, hub) are gone. |
| **`/signup`, `/login`** | New full pages, Google only. Signup asks Resident or Business owner, then shows Google's button. The right side is a brand panel. |
| **`/mysobo`** | Smart search with suggestions instead of the old box; the area drop-down removed; new **Install MySobo** card; guest onboarding no longer appears for signed-in people. |
| **All dashboards** (resident, business owner, super admin) | One shell: the page never scrolls. Top bar and left sidebar are fixed; only the main panel scrolls; tables scroll inside their own box with sticky headers. Full width: the sidebar is 260 px and the content takes everything else, with no centred max-width. On phones and tablets the sidebar becomes a bottom tab bar that is part of the layout, not floating. |
| **Help** (owner and resident) | A real ticket form (plan, topic, listing, subject, description) next to "My requests". |
| **Super admin** | Unchanged structure (10-panel overview, People, Support tickets, …) inside the new full-width shell. |

## 2. Authentication (Google only)

- **Flow:**
  1. Google Identity Services renders the official button.
  2. The ID token goes to `POST /api/auth/google/` with the chosen `account_type`.
  3. The backend verifies the token with Google: audience = our client ID, issuer, expiry, and a verified email.
  4. It finds the person by **Google's stable user ID (`sub`)**. If that Google account was never used before, an existing account with the same verified email is linked. Otherwise a new user, profile and identity are created in one transaction.
  5. A secure httpOnly session cookie (`mysobo_session`, 30 days, CSRF-protected) is set and the person goes to their dashboard: `/sobo/admin`, `/sobo/business-owner` or `/sobo/resident`. If sign-in was triggered from a page, they go back to it (`?next=`, same-site paths only).
- **Records:** `accounts_user` (unusable password for Google users), `accounts_profile` (name, `account_type`, theme, avatar), and the new **`accounts_socialidentity`**: provider, `subject` (Google's ID), email, `email_verified`, name, picture, created, last login. It has unique `(provider, subject)` and one Google identity per user, so duplicates are impossible.
- **Role:** chosen only at signup and never changed by a later login. A super admin is decided by `accounts_adminrole`. Users with a listing land on the owner dashboard.
- **Removed:** email/password signup and login, mobile OTP and the preview "demo" login are gone from the UI, and their endpoints return 404 `google_only`. Setting `ALLOW_PASSWORD_LOGIN=true` re-enables them; it's meant for local testing only.
- **States handled:** loading, not configured (clear message instead of a broken button), script failed to load, token rejected, account blocked, network error, already signed in (redirects to the dashboard).
- **Cancel:** Google does not report a closed pop-up, so the button simply stays.
- **Logout:** `POST /api/auth/logout/` ends the session; the account and data stay.
- **Public config:** `GET /api/auth/config/` gives the frontend the client ID, so only the backend needs `GOOGLE_CLIENT_ID`. A client ID is public and there is no client secret in this flow.

## 3. Database

| Table | Change in this redesign | Earlier phases |
|---|---|---|
| `accounts_socialidentity` | **new** (Google identities) | |
| `accounts_profile` | | `account_type`, `theme` (A), `avatar` (C) |
| `directory_business` | trigram search indexes | `home_visit`, `onsite_visit`, `gst_number` (C) |
| `directory_category`, `directory_subcategory`, `directory_businessservice`, `directory_businessproduct` | trigram indexes on `name` | |
| `directory_businesspost` | | `starts_on` (C) |
| `directory_savedbusiness` | | `created_at` (F) |
| `billing_planprice` | | `max_photos`, `max_active_offers` (D) |
| `billing_invoice` | | rebuilt: pending/paid/overdue, sequential numbers, GST (D) |
| `support_ticket`, `support_ticketevent` | | new (E) |

**Security:**
- All 41 public tables have **row-level security enabled**, with 54 policies (migration `directory/0007`; checked on the live DB). Django connects as the table owner and enforces access in the API.
- People only see their own tickets, saved items, activity and invoices.
- Owners can only change listings they're members of (`IsAdminOrMember`, member-filtered querysets).
- Admin endpoints require the `super_admin` role.
- Guests get 401 from every private endpoint (tested).
- GST numbers and contact details are hidden from guests.

**Supabase:**
- Postgres project `feyuptbciaqfiadxxdfr`.
- Storage buckets exist: `publicimages` (public) and `invoices` (private).
- To connect with **pgAdmin:** Supabase dashboard → Project settings → Database → Connection info. Use host `db.feyuptbciaqfiadxxdfr.supabase.co` (or the session pooler host shown there), port 5432, database `postgres`, user `postgres`, the database password, and SSL mode *require*.

## 4. Search

`directory/search.py`, used by `GET /api/businesses/?q=` and the new `GET /api/search/suggest/?q=`:
1. Lower-case, split into words, drop filler words and reduce plurals ("salons" → "salon").
2. Widen each word with everyday synonyms: doctor → clinic/medical, restaurant → food/dining/cafe, grocery → kirana/supermarket, salon → beauty/hair, electrician → electrical, and more.
3. A listing matches when every word appears in its **name, category, subcategory, products, services, description, area or society**. If nothing matches all words, listings matching any word are returned.
4. Ranking: name starts with the word > name contains it > category or subcategory > product or service > description > area. Verified listings break ties.
5. If nothing matches, each word is corrected against the real words in listing names and categories ("electrican", "resturant", "docter" all work).
6. Hidden listings are never returned. Phone-number search is for signed-in people only.

On Postgres, `pg_trgm` GIN indexes on `UPPER(name)`, as Django's `icontains` uses, keep partial matching fast. The UI waits 250 ms after typing and caches answers, so repeated queries don't call the server.

## 5. PWA installation

- **Manifest** (`/manifest.webmanifest`): `standalone` display, start URL `/sobo/app?source=app` (opens the person's dashboard), theme and background colours, and 192, 512 and maskable 512 icons (all serve 200), plus `related_applications` so Chrome can tell when the app is already installed.
- **Service worker** (`/sw.js`, cache `mysobo-shell-v4`): pages load network-first with an offline fallback, built assets cache-first, and the API is never cached. Registered in production builds; confirmed active in the local production build.
- **Install flow:** uses the browser's real `beforeinstallprompt` (Chrome, Edge, Android). iPhone/iPad Safari get "Add to Home Screen" steps. Other browsers get menu instructions.
- **Installed state:** detected by standalone display mode, the `appinstalled` event and `getInstalledRelatedApps`; install buttons hide once installed.
- **Where:** a header Install button and an **Install MySobo** card on `/mysobo` (`/mysobo#install`).

## 6. Support tickets (user → admin)

1. A resident or owner opens a ticket from Help (form) or the floating chat. The chat first asks which plan they use.
2. `POST /api/support/tickets/` stores it linked to the user (and optionally their own listing), with a number `T-00001…`, plan, category, subject, description, status **Open** and a timestamp. It's rate-limited to 20 per hour and 10 open per person.
3. The super admin sees it under **Support tickets** (badge for new ones) with the person's name and email, ticket ID, plan, category and date, plus the full description and history.
4. The admin replies and/or changes the status (open, in progress, waiting for reply, resolved, closed). Every change is stored as history and written to the audit log.
5. The person sees the status and replies under "My requests". A reply reopens a resolved ticket, and they can close it. Staff replies show as "MySobo team".

## 7. Responsive testing

Local production build (`vite preview`) against an SQLite copy of the backend. At each size I measured horizontal overflow, page-level scrolling (dashboards) and elements sticking out of the viewport.

| Size | Landing `/sobo` | `/mysobo` | Owner dashboard | Resident dashboard | Admin dashboard | Auth pages |
|---|---|---|---|---|---|---|
| 1920×1080 | | | PASS (overview, help) | PASS (main 1660 px wide) | | |
| 1440×900 | PASS (3 + 6 cards, 3 cols) | | PASS (no page scroll) | | | PASS (`/signup`) |
| 1366×768 | | | PASS (offers) | PASS (support) | PASS (support) | |
| 1024×768 | | | PASS | PASS (offers) | | |
| 768×1024 | | | PASS (tab bar in layout) | | | |
| 430×932 | | | PASS (plans) | | | |
| 390×844 | PASS (1-column grids) | | PASS (invoices; table scrolls inside) | | PASS (10 panels) | PASS (`/login`) |
| 375×812 | PASS | PASS (after fixes) | PASS (wizard) | PASS (activity) | | |

Blank cells weren't measured at that exact size. All pages share the same layout rules, which I tested at the nearest sizes.

**Problems found and fixed during testing:**
- The top bar wrapped onto two rows on phones (old CSS).
- The leaf illustration pushed the search below the fold on phones.
- The guest onboarding overlay showed to signed-in people.
- Auth page styles clashed with old class names.
- The Install button was missing when the browser had no prompt.

## 8. Dashboard scrolling

`.app.dash` is a 100 dvh flex column with `overflow: hidden`:
- The top bar is `flex: none`.
- `main` is `flex: 1; min-height: 0`.
- The layout grid is `260px | 1fr` at full width.
- The sidebar has its own `overflow-y: auto`.
- **Only `.odMain` scrolls** (`overflow-y: auto; overscroll-behavior: contain`).
- Tables sit in `.odTableWrap` with `max-height` and sticky headers.

On phones and tablets the sidebar is hidden and the bottom tab bar is a normal flex item, so nothing overlaps the content. I measured that the document height equals the viewport height on every dashboard page checked: no page-level scroll.

## 9. End-to-end checklist

| # | Test | Result | Notes |
|---|---|---|---|
| A1 | Landing loads | PASS | |
| A2 | Hero fills the first screen | PASS | `calc(100dvh − top bar)` at 1440×900 |
| A3 | Logo and navigation aligned | PASS | |
| A4 | Search works | PASS | "docter" → doctor results from the database |
| A5 | Category listings | PASS | chips from real categories, linking to category pages |
| A6 | Leaf animation | PASS | the reduced-motion rule exists but wasn't toggled in testing |
| A7 | Browse Categories = 3 cards | PASS | slots without real data show a "List your business" invite (no fake records) |
| A8 | Trusted Nearby = 6 in 3×2 | PASS | |
| A9 | Mobile layouts | PASS | 390, 375 |
| B1 | Google signup | **BLOCKED** | no Google client ID configured, and I can't sign in to Google myself; backend logic PASS in unit tests with Google's verification mocked |
| B2 | Google login | **BLOCKED** | same; unit tests PASS |
| B3 | New users saved correctly | PASS (unit) | user, profile and Google identity, with the role chosen at signup |
| B4 | Existing users log in | PASS (unit) | matched by Google ID even if their email changes |
| B5 | Duplicate accounts | PASS (unit) | unique constraints; email linked once; conflict → 409 |
| B6 | Logout | PASS (browser) | session ends, `/api/auth/me/` → 401 |
| B7 | Role-based redirect | PASS | unit + `/sobo/app` |
| B8 | Unauthorized routes protected | PASS | APIs 401/403 for guests; admin UI shows "Super admin only" |
| B9 | OAuth failure | PASS (unit) | rejected token → clear message |
| B9 | OAuth cancel | **BLOCKED** | Google doesn't report a closed pop-up; the button stays |
| B10 | Password/OTP/demo switched off | PASS | 404 `google_only` |
| C1 | Resident dashboard: full screen, fixed sidebar and header, internal scroll, no page scroll | PASS | 1920, 1366, 1024, 375 |
| C2 | Resident features | PASS | home, search, saved, offers, activity, support (ticket created), profile |
| D1 | Owner dashboard full-screen, no page scroll | PASS | 8 sizes |
| D2 | Tables and lists scroll inside | PASS | invoices table at 390 px |
| D3 | Owner data from DB, isolated per business | PASS | unit tests: owners can't edit others' listings, offers, tickets or invoices |
| E1 | Manifest | PASS | |
| E2 | Service worker registers | PASS | active in the local production build |
| E3 | Install CTA | PASS / **BLOCKED** | guidance shown; the native prompt can't fire in the embedded test browser |
| E4 | Installed app opens correctly | **BLOCKED** | needs a real device; start URL `/sobo/app` tested PASS |
| E5 | Already-installed state | **BLOCKED** | implemented, not verifiable without installing |
| E6 | Mobile install guidance | PASS | |
| F1 | Single words (salon, doctor, grocery, electrician, restaurant) | PASS | unit tests on real-shaped records + browser |
| F2 | Partial words, case, plurals, typos | PASS | "sal", "SALONS", "electrican", "resturant" |
| F3 | Results open the right page | PASS | suggestions link to `/business/<slug>` and category pages |
| F4 | Empty state | PASS | |
| G1 | User submits a ticket | PASS | T-00002 via the Help form |
| G2 | Stored in DB, appears for admin | PASS | |
| G3 | Admin reads, replies, changes status | PASS | Phase E browser test + unit tests |
| G4 | User sees status | PASS | |
| G5 | Permissions | PASS | others → 404, non-admins → 403 |
| H | Responsive | PASS | see section 7 |
| — | Backend unit tests | PASS | 116 tests (SQLite locally; CI runs them on Postgres) |
| — | Frontend build (tsc + vite) | PASS | |
| — | Live site end to end | **BLOCKED** | live backend returns 500 until Storage env vars are set |

## 10. Remaining work and required configuration

**Required before the live site works (backend Vercel project `mysobo-u467`):**
1. `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET` (`publicimages`), `SUPABASE_STORAGE_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`. Without them the backend refuses to start (current 500).
2. `GOOGLE_CLIENT_ID`: Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Authorized JavaScript origins: `https://mysobo.vercel.app`, and for local use `http://localhost:5173` and `http://localhost:4173`. No client secret is needed. **Until this is set nobody can sign in, including admins.** Existing admins sign in with Google using the same email as their account; it links automatically.
3. `CRON_SECRET` (daily billing job), optional `INVOICE_SELLER_NAME`, `INVOICE_SELLER_ADDRESS` and `INVOICE_SELLER_GSTIN` (the PDF says "TAX INVOICE" only with a GSTIN).

**Known gaps:**
- Live data is thin: 2 listings (1 public). The landing shows real records plus invitations in the empty slots.
- No email/SMS notifications for tickets, invoices or approvals.
- Payments are recorded manually (UPI/cash); there is no payment gateway.
- The 10 admin panels are my interpretation; the brief's exact list wasn't available.
- Admin screens are English-only.
- "Browse Categories" shows the newest businesses, not newest people, to avoid publishing residents' names and photos.

## 11. Important files

- **Backend, new:** `accounts/migrations/0007_social_identity.py`, `directory/search.py`, `directory/migrations/0015_search_indexes.py`, `directory/insights.py`, `billing/{services,pdf,views,limits}.py`, `support/` (app), `accounts/sessions.py`.
- **Backend, changed:** `accounts/models.py` (SocialIdentity), `accounts/views.py` (Google-only, config endpoint), `directory/views.py` (search, suggestions), `mysobo/settings.py`, `mysobo/urls.py`.
- **Frontend, new:** `src/auth.tsx` (signup/login pages, rewritten), `src/google.tsx` (rewritten), `src/leaves.tsx`, `src/smartSearch.tsx`, `src/landing.tsx` (rewritten), `src/pwa.tsx` (rewritten), `src/accountMenu.tsx`, `src/support.tsx` (+ TicketForm), `src/session.ts`, `src/dashboard.tsx`, `src/resident.tsx`, `src/adminOverview.tsx`, `src/adminBilling.tsx`, `src/ownerFlows.tsx`.
- **Frontend, changed:** `src/App.tsx` (Shell, routes, `/mysobo`), `src/styles.css` (redesign block), `src/i18n.tsx` (English, Gujarati and Hindi for every new string), `public/manifest.webmanifest`, `public/sw.js`.
- **Removed:** the email/password + OTP login dialog (`LoginDialog`), the old `AuthScreen` form, and the old `SearchBox`.

## 12. Final status

**Code: feature-complete for this brief and tested locally. Production: not ready.** Three things stand between this and a working live site, all configuration rather than code:
1. The Storage env vars, so the backend starts.
2. The Google client ID, so anyone can sign in.
3. A real-device check of Google sign-in and PWA install once both are set.
