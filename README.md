# MySobo

Verified local-first business directory for South Bopal.

## Product areas

The frontend has three product routes:

- `/mysobo` — resident service/product discovery, search, listing details, calling,
  WhatsApp, saved businesses, and reviews. Listing and search state stays on
  this route; sign-in opens as a dialog.
- `/mysobo/owner` — claim or create listings, edit listing details, submit offers,
  see verification status, and request a plan change.
- `/mysobo/superadmin` — verify listings and owner claims, add field-agent
  entries, manage an expandable category and subcategory catalogue, review plan
  requests, set plan prices, and record payments.

The owner and admin portals require a signed-in account. Admin API operations
also require the `super_admin` role. Create an initial staff account with
`python manage.py createsuperuser`, then assign its role in Django admin under
**Admin roles**. Authentication currently uses DRF token auth; resident and
owner tokens are kept in the browser session and removed when logging out.
Residents can sign in or create an account with an SMS one-time code. Local
development prints the OTP to the backend console; production must configure
Twilio credentials and set `OTP_SMS_BACKEND=twilio`. CI sets
`OTP_SMS_BACKEND=mock`; this backend is only accepted when `CI=true` and never
makes a network request.

On `/mysobo`, **All listings** is selected by default. **Services** includes
service and both-type businesses; **Products** includes product and
both-type businesses. The category grid follows the selected type, and
category filtering combines with the selected type. Category availability is
managed in the super-admin portal. Product categories and subcategories are
seeded in the database, can be searched and edited without frontend changes,
and support nested subcategory levels, ordering, Product/Service/Both types,
active state, icons, and image uploads. Home-page category counts are computed
from visible, non-deleted listings in the configured database.

## Stack

- React.js + TypeScript
- Django REST Framework
- PostgreSQL (configured with `DATABASE_URL` or the individual `DB_*` values)

## Local setup

1. Copy `backend/.env.example` to `backend/.env`, fill in the development
   PostgreSQL connection values, and keep that file local.
2. Install dependencies, check the PostgreSQL connection, and migrate:
   `cd backend && python -m pip install -r requirements.txt && python manage.py check --database default && python manage.py migrate`
3. Initialize launch categories with `python manage.py seed_mysobo`.
4. Optionally add clearly marked, contact-free demo businesses for local filter testing:
   `python manage.py seed_demo_listings`
5. Start the API:
   `python manage.py runserver`
6. Install and start the frontend:
   `cd frontend && npm install && npm run dev`

The backend reads `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`,
`DJANGO_ALLOWED_HOSTS`, `DATABASE_URL` or all of `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `DB_HOST`, and `DB_PORT`, and `CORS_ALLOWED_ORIGINS` from the
environment or `backend/.env`. It requires an explicit database configuration
and no longer silently falls back to SQLite. A SQLite URL is accepted only in
debug mode for isolated tests. Production must set a non-placeholder
`DJANGO_SECRET_KEY`, set `DJANGO_DEBUG=false`, and configure allowed hosts.
The backend intentionally refuses to start in production mode without these
values. Set `VITE_API_URL` in `frontend/.env` for local development. Because the
frontend and backend deploy separately, set the frontend Vercel project's
`VITE_API_URL` to `https://<backend-domain>/api` and set the backend's
`CORS_ALLOWED_ORIGINS` to the frontend's HTTPS origin. Redeploy the frontend
after changing `VITE_API_URL`, since Vite embeds it in the production bundle.
Never commit `.env` files, API keys, or database credentials.

The PostgreSQL migration installs `pg_trgm`, `unaccent`, and `pgcrypto`, adds
trigram GIN indexes for business name and description search, and retains the
`(category, verification_level)` index. PostgreSQL must permit installing
these extensions and creating indexes; run migrations with the schema-owner
database role.

For a local development PostgreSQL storage/API check, set `DJANGO_DEBUG=true`
and use a loopback `DB_HOST`, start Django with `python manage.py runserver`,
then run `python manage.py verify_postgres_storage` in another terminal. It
creates idempotent development-only user, profile, category, business, and
event rows, reads them back with raw SQL, and requests the listing through the
local HTTP API. After restarting Django, run
`python manage.py verify_postgres_storage --verify-only` to read the same rows
again. The command refuses non-PostgreSQL databases, non-debug settings, and
non-loopback hosts.

PostgreSQL enables row-level security on resident, owner, listing, taxonomy,
and billing data. The API sets a transaction-local user context for each
request. Use a dedicated runtime database role that does not own the tables and
does not have `BYPASSRLS`; use the schema-owner/migration role only for
migrations and seed commands. Grant the runtime role the required table and
sequence privileges. SQLite is used for local development and does not enforce
PostgreSQL RLS.

GitHub Actions runs the frontend build and Django checks, migration check, and
tests against PostgreSQL on pushes and pull requests to `main`.


## Production database (Supabase)

Use Supabase's **transaction pooler** so traffic spikes (for example a WhatsApp
digest sent to thousands of residents) never run out of database connections:

```
DATABASE_URL=postgresql://postgres.<project>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres
```

Port `6543` is detected automatically: server-side cursors and prepared
statements are turned off, which the pooler requires. Run **migrations** over
the direct or session connection (port `5432`), because the pooler can cut long
schema changes short.

| Setting | Default | What it does |
|---|---|---|
| `DB_CONN_MAX_AGE` | `60` | Seconds to reuse a connection; health checks drop dead ones. |
| `DB_STATEMENT_TIMEOUT_MS` | `5000` | Each API request's queries are cancelled after this long. |
| `DB_LOCK_TIMEOUT_MS` | `3000` | A request gives up waiting for a row lock after this long. |
| `DB_TRANSACTION_POOLER` | `false` | Force pooler mode when not using port 6543. |

Timeouts are set with transaction-local `set_config`, the same way as the
row-level-security user context, so they never leak between requests through
the pooler. Management commands and migrations are not limited.

**Errors.** API errors always come back as JSON, `{"detail": "...", "code": "..."}`:
`conflict` (409) for duplicates, `invalid` (400) for bad input, `timeout` or
`unavailable` (503) for database trouble, `server_error` (500) otherwise.
Details are logged on the server and never shown to users.

**Duplicates.** The database itself allows only one pending listing request per
person per business and one pending plan request per business. Payment
references must be unique. Before running migration `0011` and billing `0003`
on an existing database, check there are no duplicate pending rows.

**Monitoring.** `GET /api/health/` returns `{"status": "ok", "database": "ok"}`
(200) or 503. Point an uptime monitor at it.

**History is kept.** Businesses are soft-deleted (`deleted_at`); payments and
invoices are protected from deletion; reviews stay with their business.
