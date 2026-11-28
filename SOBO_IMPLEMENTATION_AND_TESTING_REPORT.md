# SOBO: implementation and testing report (Phase 2)

Date: 28 Nov 2026 · Repository `vp098/MYSOBO` · Branch `sobo-platform` → `main`
Live: frontend **https://mysobo.vercel.app** · API **https://mysobo-u467.vercel.app** · Database: Supabase `feyuptbciaqfiadxxdfr` (Postgres, Seoul `ap-northeast-2`)

## 0. Summary: what you can do today

| | Status |
|---|---|
| Open SOBO on your phone at https://mysobo.vercel.app | **PASS**: the live site and API work (they were down all day; see section 1) |
| Install SOBO on the phone (leaf icon, name "SOBO") | **Ready**: manifest, icons and service worker are served live. Install on a real phone: **BLOCKED** (I can't test a real device); the steps are in section 6 |
| Google sign-up / login | **BLOCKED** until you set `GOOGLE_CLIENT_ID` on Vercel (section 4). The code is done and unit-tested |
| Super Admin access | **BLOCKED** until you set `SUPERADMIN_EMAILS` (and Google) (section 9) |
| Browse Service/Product → category → listing → details | **PASS** (locally and live API) |

## 1. Production outages found and fixed today

The live backend had been failing on every request. Three separate causes, found one after another and each fixed in its own PR:

1. **Missing `app` for Vercel** (PR #12): `wsgi.py` only exposed `application`, but Vercel's Python runtime looks for `app`. Startup problems now also answer a readable 503 instead of a crash.
2. **Storage settings stopped startup** (PR #11, #13): the live `SUPABASE_URL` wasn't in the exact `https://<project>.supabase.co` form. It is now read tolerantly, and Storage problems only switch uploads off. `/api/health/` reports `media_uploads`, `storage_problem` and `google_sign_in`.
3. **Database pooler full** (PR #15): `EMAXCONNSESSION max clients reached in session mode (pool_size 15)`. Each serverless instance kept a session-pooler connection. In production the same Supabase host is now used on the transaction pooler (port 6543). Database failures return JSON 503.

Plus **PR #14**: the API ran in Washington DC (`iad1`) while the database is in Seoul. It's now pinned to `icn1`.

**Live API timings** (curl from here, through `mysobo.vercel.app`):

| Endpoint | Before | After |
|---|---|---|
| `/api/health/` | 500 / 2.1 s | 200 / 0.5–0.85 s |
| `/api/categories/?kind=service` | 500 / 3.3 s | 200 / 0.33–1.35 s (warm 0.33 s) |
| `/api/businesses/` | 500 / 3.2 s | 200 / 0.37 s |
| `/api/search/suggest/?q=doctor` | 500 / 4.1 s | 200 / 0.53 s |

## 2. Pages redesigned or added

| Page | What changed |
|---|---|
| `/services`, `/products` (**new**) | Service Based / Product Based discovery. All categories of that type from the database, each with image, description, listing count and number of types, plus search inside the list. Same fixed app layout. |
| `/services/<cat>/…`, `/products/<cat>/…`, `/categories/…` | App layout: fixed panel (category, subcategories with counts, filters), fixed header (breadcrumbs **Home › Service Based › Category › Subcategory**, count, sort), and only the results scroll. On phones the panel becomes a drawer. |
| `/business/<slug>` (incl. `sample-sobo-rapid-home-ac-care`) | **Vercel-style layout:** fixed left section nav (Overview, Services/Products, Offers, Photos, Hours, Reviews); fixed header (cover, name, verified badge, rating, open now, Share, Save); a main panel that is the only scrolling part; a right panel with contact (Call/WhatsApp, or a masked number plus "log in to see number") and details (address, today's hours, type, home/on-site visit, verification). Phones: section chips, with contact at the top of Overview. No page-level scroll at any tested size. |
| Landing `/sobo` | The "Service Based" / "Product Based" labels open `/services` / `/products`. The hero text no longer fades in (faster LCP), and category chips reserve their space (no layout shift). |
| Owner dashboard | **New "Services & products" section:** add an item (type, name, category, price, description), edit price, show/hide, mark available, delete. |
| Super Admin | **People:** account type, deactivate/reactivate, make/remove admin (can't lock yourself out). **Products & services:** moderation list with search and filters and a switch-off control. The overview adds service/product totals. |
| Resident dashboard | Sidebar adds "Service Based" and "Product Based" links. |
| PWA | App name **SOBO**, theme `#287A4B`, leaf icons 192/384/512 + maskable 192/512, shortcuts, `/offline.html`, service worker v5. |

## 3. Category navigation

Landing → **Service Based** (`/services`) or **Product Based** (`/products`) → category (`/services/<slug>`) → subcategory (`/services/<slug>/<sub>`) → listing (`/business/<slug>`) → details (sections and contact panel).

Categories come from the `directory_category` / `directory_subcategory` tables, which admins manage under Admin › Categories. There are breadcrumbs and Back on every level, search inside categories (on `/services`) and inside a category (the filters), skeleton loading states, empty states with actions, and pagination of 20 per page. No dead ends: every card links to the next level.

## 4. Authentication: Google only

- `POST /api/auth/google/` verifies Google's ID token (audience, issuer, expiry, verified email). It finds the person by Google ID (`accounts_socialidentity`, unique `(provider, subject)`); otherwise it links an existing account with the same verified email; otherwise it creates user + profile + identity. The role (resident / business owner) is chosen on `/signup`.
- Session: httpOnly cookie `mysobo_session`, 30 days, CSRF-protected. Logout ends the session.
- Password, OTP and demo logins are switched off (404 `google_only`) unless `ALLOW_PASSWORD_LOGIN=true`.
- **Protected boundary:** browsing is open. The phone number, the full description and reviews need sign-in. "Log in to see number" goes to `/login?next=/business/<slug>` and returns to that exact page after signing in (tested).

**To enable Google (required):**
1. Google Cloud Console → APIs & Services → Credentials → **Create credentials → OAuth client ID → Web application**.
2. **Authorised JavaScript origins:** `https://mysobo.vercel.app` (add `http://localhost:4173` and `http://localhost:5173` for local testing). No redirect URI or client secret is needed for this sign-in flow.
3. Copy the Client ID (`…apps.googleusercontent.com`).
4. Vercel → project **mysobo-u467** (the backend) → Settings → Environment Variables → add `GOOGLE_CLIENT_ID` = that ID (Production) → **Redeploy**.
5. Check: https://mysobo.vercel.app/api/health/ shows `"google_sign_in": true`, and `/signup` shows the Google button.

## 5. Database changes (Phase 2)

No schema migrations in Phase 2. Earlier ones are all applied live (up to `accounts/0007_social_identity`, `directory/0015_search_indexes`, `support/0001_tickets`, `billing/0005`).

New API endpoints:
- `GET /api/owner/catalog/`, `PATCH/DELETE /api/owner/catalog/<type>/<id>/`
- `GET /api/admin/catalog/`, `PATCH /api/admin/catalog/<type>/<id>/`
- `PATCH /api/admin/users/<id>/`

All 41 public tables have RLS enabled (54 policies). Permissions are enforced on the server: owners only for listings they're members of, admin endpoints require `super_admin`, and guests get 401.

## 6. PWA and mobile installation

| Item | Result |
|---|---|
| Manifest `name`/`short_name` = SOBO, `display: standalone`, `start_url: /sobo/app?source=app`, theme/background colours | PASS (served live) |
| Leaf icons: 192, 384, 512 (any) and 192, 512 (maskable); 180 apple-touch-icon | PASS (all 200 live) |
| Service worker registers and is active (production build) | PASS (local production build); `/sw.js` 200 live |
| Offline fallback `/offline.html` | PASS (served); offline navigation falls back to the last app shell, then the offline page |
| API/media never cached by the service worker; new versions replace the old cache | PASS (by design: `sobo-v5`) |
| Install button / card: native prompt (Android, desktop Chrome/Edge), iPhone steps, already-installed detection | Implemented. The native prompt never fires in the embedded test browser → **BLOCKED** (needs a real device) |
| Installed app opens SOBO | `/sobo/app` opens your dashboard, or Explore for guests: PASS in the browser. On a real device: **BLOCKED** |

**Install on your phone today:**
- **Android (Chrome):** open https://mysobo.vercel.app/mysobo → tap **Install SOBO** (or Chrome menu ⋮ → *Install app / Add to Home screen*) → the SOBO leaf icon appears on the home screen.
- **iPhone (Safari):** open https://mysobo.vercel.app → **Share** → **Add to Home Screen** → Add. The installed app is named "SOBO" with the leaf icon.

## 7. Dashboards and scrolling

One shell for resident, owner, admin, category, Service/Product and business pages. `.app.dash` is a `100dvh` flex column with `overflow: hidden`; the top bar is fixed; the sidebar and right panels have their own `overflow-y: auto`; the main panel is the only scrolling area (`min-height: 0`); tables scroll inside `.odTableWrap`. On phones the sidebar becomes the bottom tab bar or a drawer. Measured: document height = viewport height on every dashboard page tested (no page-level scroll).

## 8. Roles

| Role | Implemented and verified |
|---|---|
| **Resident** | Profile (name, picture, language, theme), browse Service/Product, search, categories, listings, saved (PASS: Save stored in the database), offers, activity, Help (ticket form + status), logout |
| **Business owner** | Onboarding wizard → Pending Approval; edit business info, visit options, GST, hours; photos (uploads now enabled live); **Services & products** (PASS: add / hide / price; the hidden item disappears for guests); offers; approval requests with feedback; plans, invoices (GST PDF); stats where events exist; Help; logout |
| **Super Admin** | 10-panel overview from live queries (users, residents, owners, businesses, services, products, pending approvals, open tickets, …); People (search, filter, account type, deactivate/reactivate, make/remove admin; PASS); business verification (approve, reject with note, hide/suspend), CSV import; categories and subcategories (create, edit, deactivate; these drive the public pages); Products & services moderation (PASS); offers moderation; plan requests; pricing and limits; payments and invoices; reports; support tickets (reply, status, history); audit log; settings |

**Not implemented:** editable homepage content (the landing is driven by real categories and listings; there are no free-text homepage blocks).

## 9. Super Admin: how you get in

1. Vercel → project **mysobo-u467** → Settings → Environment Variables → add **`SUPERADMIN_EMAILS`** = the Gmail address you'll sign in with (comma-separate several) → Redeploy. This setting only exists on the server; nothing is in the frontend or Git.
2. Make sure Google sign-in is enabled (section 4).
3. Open https://mysobo.vercel.app/login → Continue with Google with that account.
4. The backend checks that Google verified the email and that it's in `SUPERADMIN_EMAILS`, then grants `super_admin` (stored in `accounts_adminrole`, audit-logged) and sends you to **https://mysobo.vercel.app/sobo/admin**.
5. Check: the overview loads, the account menu shows your name, and `/api/auth/me/` returns `"is_superadmin": true`. Everyone else who signs up gets resident or business owner, never admin.
6. Alternative on a trusted server: `python manage.py grant_superadmin you@gmail.com` (and `revoke_superadmin`). The person must have signed in once first.

## 10. Performance

| Measure | Before | After |
|---|---|---|
| Main JavaScript bundle | 864.7 KB (252 KB gzip), one file | **494 KB (139 KB gzip)**. Owner (69 KB), admin (40 KB), resident (11 KB), listing (16 KB) and browse (5 KB) load only when opened; React, React Query and Framer Motion are separate cached chunks |
| Landing LCP (390×844, local production build) | 3,056 ms (hero text faded in) | **976–1,504 ms** |
| Landing CLS | 0 → 0.108 after removing the animation | **0** (category chips reserve their space) |
| Fonts | render-blocking stylesheet | preloaded, non-blocking |
| Search suggestions | — | 250 ms debounce, cached; API 0.53 s live, ~50 ms local |
| Live API | see section 1 | 0.3–1.3 s |

Measured with the browser's Performance APIs (LCP, layout shift, navigation and resource timing) on the local production build. Lighthouse wasn't available in this environment.

## 11. Responsive testing (local production build; document scroll / horizontal overflow)

| Page | 1920 | 1440 | 1366 | 1024 | 768 | 430 | 390 | 375 |
|---|---|---|---|---|---|---|---|---|
| Landing | | PASS | | | | | PASS | PASS |
| `/services`, `/products` | | PASS | | | PASS | | | PASS |
| Category page | PASS | PASS | PASS | | PASS | | | PASS |
| Business detail | PASS | PASS | | PASS | | | PASS | |
| Signup / login | | PASS | | | | | PASS | |
| Resident dashboard | PASS | | PASS | PASS | | | | PASS |
| Owner dashboard (+ Services & products) | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Super Admin (overview, People, Products & services) | | | PASS | | | PASS | PASS | |
| Ticket forms | PASS | | PASS | | | | | |

Blank cells weren't measured at that exact size. All pages share the same layout rules, which were tested at the nearest sizes.

## 12. End-to-end journeys

| Journey step | Result |
|---|---|
| Resident: landing → Service Based → category → listing | PASS |
| → protected detail → login (`?next=` back to the listing) | PASS |
| → Google sign-up | **BLOCKED** (no Google client ID); simulated with a real server-side session |
| → returns to the listing, real number shown, Save stored | PASS |
| → Help → ticket submitted → status visible → logout | PASS (Phase G / E tests) |
| Owner: onboarding → Pending Approval → Services & products → offers → ticket → logout | PASS (Google step BLOCKED) |
| Admin: overview → People (deactivate/reactivate) → Products & services (switch off) → approve listing → categories → tickets reply/status → logout | PASS locally (Google step BLOCKED) |
| Live: landing, API, categories, listings, search, manifest, icons, service worker | PASS |

## 13. Git

All work went through pull requests into `main`, each with CI (backend tests on Postgres + frontend build) passing before merge:
- #11 `13cde09` PWA, Super Admin bootstrap, Storage
- #12 `0da1f69` Vercel `app`
- #13 `aa0300c` Storage tolerance, management APIs
- #14 `c90046d` Seoul region
- #15 `ac8af35` (merge) transaction pooler
- #16: this frontend work and this report (hash in the final message)

Backend: 124 tests OK. Frontend: `tsc` + `vite build` OK. ESLint isn't configured for the flat-config format the installed ESLint version needs, so linting didn't run.

## 14. Remaining work and deployment requirements

**Must do (you, on Vercel project `mysobo-u467`):**
1. `GOOGLE_CLIENT_ID` (section 4). Until then nobody can sign in, admins included.
2. `SUPERADMIN_EMAILS` (section 9).
3. Recommended: change `DATABASE_URL` to port **6543** yourself (the code does this automatically today); set `CRON_SECRET` (daily billing job), and `INVOICE_SELLER_NAME`, `INVOICE_SELLER_ADDRESS`, `INVOICE_SELLER_GSTIN`.

**Known limitations:**
- The live data is thin: 1 public listing ("selling papers"), 55 categories.
- There are no email/SMS notifications.
- Payments are recorded manually (UPI/cash).
- Admin screens are English-only.
- The translations file (177 KB) is still in the main bundle.
- Editable homepage content isn't implemented.
- Real-device PWA install and Google sign-in have not been tested by me.

**Final status:** the website is live, responsive and installable, and browsing works end to end today. Sign-in, and with it the owner and admin dashboards on the live site, waits only on the Google client ID setting.
