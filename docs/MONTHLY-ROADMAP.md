# MySobo: One-Month Product and Engineering Roadmap

**Planning horizon:** four weeks (about 20 working days)  
**Scope:** existing Vite/React frontend, Django REST API, Supabase PostgreSQL,
and Supabase Storage. This is a prioritised working plan, not a promise that
every optional feature will fit in one month.

## What exists today

This inventory is based on the checked-in frontend and backend code. A feature
being present in code does not mean its production configuration or real-user
workflow has been verified.

### Frontend

- Resident directory at `/mysobo`: category browsing, search, listing cards,
  service/product/all modes, category-specific filters, pagination, and empty
  and error states.
- Listing detail dialog/page: business contact links, saved businesses,
  resident reviews, and call/WhatsApp interaction tracking.
- Sign-in flows for password/token login and mobile OTP.
- Owner portal: create and edit basic listings, search for a listing to claim,
  submit offers, and request a plan change.
- Super-admin portal: manage category/subcategory/field metadata, review
  businesses and claims, create field listings, import CSV, manage plan prices,
  and record payments.
- Responsive styling and client-side API caching are present.

### Backend

- Django REST Framework endpoints for categories, businesses, products,
  services, owner operations, admin operations, login/OTP, reviews, saved
  businesses, contact events, and CSV import.
- Models for accounts, societies, listings, categories/subcategories, products,
  services, hours, photos, offers, claims, reviews, reports, events, plans,
  subscriptions, payments, invoices, and audit records.
- Listing visibility/verification rules, role checks, OTP controls, PostgreSQL
  row-level security migrations, and local category/demo seed commands.
- Django admin is available for operational management.
- Frontend Vercel SPA routing and separate frontend/backend deployment
  instructions are already in the repository.

## How many features remain?

There is no approved product requirements list that defines a finite total
feature count. It would be misleading to claim that a precise number of all
remaining features is known. Based on this code review, this plan tracks **16
prioritised workstreams**: 5 release-critical foundations, 7 workflow/UX
improvements, and 4 later-stage capabilities. These are groups of work, not 16
independent features that are all guaranteed to ship in one month.

## Current release blockers and evidence

1. **Production image persistence needs a real end-to-end verification.** The
   backend previously used local filesystem media storage. The current
   uncommitted changes configure Supabase S3-compatible media storage for
   production and keep local storage for development. They add required
   `SUPABASE_*` settings and fail fast when production settings are absent.
   The actual Supabase bucket, credentials, Vercel settings, deployed upload,
   and image retrieval have not been verified from this workspace.
2. **Production directory data needs reconciliation.** In the last production
   investigation, admin/API counts for categories, businesses, services, and
   products were zero. Recheck the intended Supabase project and production
   API before adding records; do not seed or change production data until the
   target database is confirmed.
3. **Owner image upload is not implemented in the owner forms.** The models
   have image/file fields and the category manager submits multipart uploads,
   but creating/editing an owner listing currently sends JSON and exposes no
   logo or cover-image upload control.
4. **Payment collection is not integrated.** The admin UI records a payment
   manually and creates an invoice record. No payment gateway checkout flow is
   present in the inspected frontend/backend code.
5. **Production SMS delivery depends on setup.** OTP has a Twilio backend, but
   production still needs correctly configured credentials and an end-to-end
   deliverability check.

## Prioritised workstreams

### P0 — finish before treating production as launch-ready

| # | Workstream | Done when |
|---|---|---|
| 1 | Confirm the production database target | The team confirms the Supabase project used by Vercel, checks the relevant tables read-only, and verifies the API is reading that project. No reset or destructive migration is used. |
| 2 | Finish persistent image storage rollout | A public Supabase Storage bucket is configured; secrets exist only in backend Vercel settings; a newly uploaded image survives a fresh server invocation and its API URL loads in a signed-out browser. |
| 3 | Resolve the production catalogue/data state | The intended category and listing data are present and visible through the exact production endpoints, or the absence/ownership of the data is explained. Any import is reviewed and backed up first. |
| 4 | Improve image failure handling | Frontend cards show a usable fallback when an image is missing or returns an error; upload forms display validation and upload errors without false success. |
| 5 | Verify deployment configuration and rollback | Vercel production variables, CORS, allowed hosts, API base URL, migrations, deployment logs, and a rollback path are checked and documented. No secret values are placed in Git. |

### P1 — core resident and owner workflow improvements

| # | Workstream | Done when |
|---|---|---|
| 6 | Complete owner listing media editing | Owners can upload/replace logo and cover image through multipart requests; successful changes persist in Storage and show on public listing details. |
| 7 | Improve resident directory UX | Search/filter state, pagination, sorting, loading/error/empty states, and mobile layouts are tested together on populated data. |
| 8 | Complete listing details | Hours, available contact options, location/address privacy, and listing photos are consistently represented in API responses and the detail UI. Keep private address behavior intact. |
| 9 | Finish owner claim lifecycle | Owners can see pending/approved/rejected claim status and meaningful review notes; duplicate or conflicting claims receive clear, safe errors. |
| 10 | Finish offer/update lifecycle | Owners can see review status and admins can review or publish/reject offers; public display only includes approved content. |
| 11 | Validate OTP production operations | Twilio credentials, consent text/version, rate limits, delivery failures, resend behavior, and token/session lifecycle are checked without logging OTPs or credentials. |
| 12 | Improve admin moderation safety | Admin list/search/filter and action feedback are usable with realistic data; verification/rejection actions are auditable and cannot accidentally expose rejected/hidden listings. |

### P2 — schedule after the launch path is stable

| # | Workstream | Done when |
|---|---|---|
| 13 | Replace manual payment recording if required | Product owner selects a payment provider; checkout, webhook signature verification, idempotency, refunds/failures, and subscription state transitions are implemented and tested. Do not start until this decision is made. |
| 14 | Complete invoice/reporting workflows | Invoice output and admin revenue/subscription reporting meet the business's accounting requirements; current `pdf_path` storage is either implemented or explicitly deferred. |
| 15 | Add operational observability | Useful request/error reporting, upload failures, SMS delivery failures, and admin actions can be diagnosed without exposing PII, OTPs, or secrets. |
| 16 | Expand automated release coverage | Add frontend component/e2e coverage for resident, owner, admin, and upload flows; CI verifies critical behavior before production deployment. |

## Four-week delivery plan

The order is intentional: don't polish an empty public directory or add optional
billing before confirming that production reads the right data and reliably
stores images.

### Week 1 — production foundation and diagnosis

**Focus:** workstreams 1–5.

- Confirm which Vercel backend deployment and Supabase project are production.
- Record read-only counts from categories, businesses, products, and services;
  compare with the production API and admin.
- Configure the Supabase Storage bucket and required server-side Vercel
  environment variables. Do not share or commit access keys.
- Deploy the storage change only after verifying the selected bucket and
  environment; test one new image upload, generated public URL, and a fresh
  read after deployment.
- Fix image fallback/error feedback and verify SPA/API routing, CORS, and
  production logs.
- If production data is missing, agree on the source and a safe import plan;
  don't run seed commands against an uncertain production database.

**Week 1 exit criteria:** production points at the intended database; an
uploaded image remains available after a fresh invocation; categories and
listings return expected counts, or there is a specific data-recovery/import
decision with an owner.

### Week 2 — resident discovery and listing quality

**Focus:** workstreams 7–8.

- Test home, category, subcategory, search, verified, rating, price, sorting,
  and pagination with a representative dataset.
- Refine empty/loading/error states so empty data is distinguishable from API
  failure.
- Verify image aspect ratios, broken-image fallbacks, and mobile/tablet
  behavior.
- Confirm hours, business photos, contact methods, and hidden-address behavior
  are correctly serialized and displayed.
- Check keyboard interaction, focus behavior, labels, and basic contrast.

**Week 2 exit criteria:** residents can find a populated category, use filters,
open a listing, understand its trust/contact details, and recover from errors
on desktop and mobile layouts.

### Week 3 — owner and moderation workflows

**Focus:** workstreams 6, 9, 10, and 12.

- Add owner image upload/edit controls and test multipart validation and
  persistence.
- Test claim submission through admin review and owner-visible status.
- Test listing creation, edits, verification, rejection/hiding, and the public
  visibility rules.
- Test offer submission/review and admin taxonomy editing with real workflow
  roles.
- Improve admin search and action confirmations where operational testing
  reveals friction.

**Week 3 exit criteria:** an owner can create/edit a listing with media, request
a claim, and see an accurate status; an admin can review it; only approved,
visible data appears publicly.

### Week 4 — production hardening and release

**Focus:** workstreams 5, 11, and 15–16; evaluate P2 decisions.

- Verify production OTP using the configured SMS provider, including rate
  limits and delivery failure handling.
- Add/finish high-value automated tests for auth, public visibility, uploads,
  claim/moderation, and API error states.
- Check logs and monitoring for actionable errors while redacting sensitive
  data.
- Run backend checks/tests and frontend lint/typecheck/build in CI.
- Do a release checklist, production smoke test, and rollback review.
- Decide whether online payments and generated invoices are needed now; scope
  them separately rather than shipping unverified financial behavior.

**Week 4 exit criteria:** the release pipeline is green; smoke tests cover the
main resident, owner, admin, OTP, and image paths; the team has a named owner
for any deferred issue and a documented production rollback.

## Suggested release acceptance checklist

- [ ] Production API uses the intended Supabase PostgreSQL project.
- [ ] Category, business, product, and service API counts match expected data.
- [ ] New category and business images upload to Supabase Storage and load after
      a fresh invocation.
- [ ] Missing image URLs render a fallback and do not break cards.
- [ ] Public API never reveals hidden, deleted, unverified-only, or private
      address data contrary to existing visibility rules.
- [ ] OTP works with production SMS configuration and secrets/OTP values are not
      written to logs.
- [ ] Owner claim, listing, and offer states match admin decisions.
- [ ] Frontend lint, typecheck, and build pass; backend checks and tests pass.
- [ ] No destructive migration, reset, or unreviewed seed/import was run against
      production.
- [ ] Vercel environment configuration is documented by variable name only, not
      by secret value.

## Out of scope until confirmed

Do not assume the product needs an online payment gateway, map/geocoding,
push notifications, chat, resident social feeds, or native mobile apps simply
because they are common marketplace features. Decide these from user feedback
and business requirements after the current data, image, and owner workflows
are reliable.
