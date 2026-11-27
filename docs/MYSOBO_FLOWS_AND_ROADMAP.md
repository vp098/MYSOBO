# MySobo: Current Flows and UX Roadmap

## Table of contents

- [Part 1: Current state](#part-1-current-state)
  - [Resident flows](#a-resident-guest-and-logged-in)
  - [Business-owner flows](#b-business-owner-mysoboowner)
  - [Super-admin flows](#c-super-admin-mysobosuperadmin)
  - [Cross-cutting rules](#d-cross-cutting)
- [Part 2: Proposed future improvements](#part-2-future-recommendations-proposed-not-built)
- [Part 3: Open questions](#part-3-open-questions)
- [Screens checklist for the designer](#screens-checklist-for-the-designer)

---

# Part 1: CURRENT STATE

## Scope and evidence

This document describes behavior implemented in the React application and Django REST API at the time of review. It does not treat the existing roadmap document or an unimplemented business specification as evidence of current behavior.

Main implementation references:

- Resident and owner/admin screens: [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx), routes and portal components.
- API client and response shapes: [frontend/src/services/api.ts](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/services/api.ts).
- Public and product/service endpoints: [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py).
- Owner and admin endpoints: [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py).
- Data models: [backend/directory/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/models.py), [backend/accounts/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/models.py), and [backend/billing/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/billing/models.py).
- API routes: [backend/mysobo/urls.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/mysobo/urls.py) and [backend/directory/urls.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/urls.py).
- API validation and serialization: [backend/directory/serializers.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/serializers.py).
- Authentication: [backend/accounts/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/views.py).
- Database permissions: [backend/directory/migrations/0007_postgresql_row_level_security.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/migrations/0007_postgresql_row_level_security.py).

## A. RESIDENT (guest and logged in)

### A1. Resident route and shell

**Flow:** Visit `/` -> browser redirects to `/mysobo` -> resident home shell appears.

1. User opens `/` -> **MySobo redirect** -> `/mysobo` is shown. Unknown routes also redirect to `/mysobo`. (`App`, routes `"/"` and `"*"`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1721)
2. A guest sees **Residents**, **For businesses**, and **Log in** in the top navigation. A logged-in user sees **Log out** instead of **Log in**. Super-admins additionally see **Super admin**. (`Shell`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):24)
3. Logged-in and guest users see the same public resident search and category screens.

### A2. Home and listing search

**Flow:** `/mysobo` -> All/Services/Products choice -> category choice/subcategory choice -> listing cards -> business popup or `/business/:slug`.

1. User opens `/mysobo` -> **South Bopal resident home** appears with the heading "Find trusted help, close to home." The page has a search box, All listings/Services/Products tabs, popular categories, and local listing results. (`Residents`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):480)
2. User enters a search term and submits -> the URL gains `q=<term>` and the listing request uses `q` -> matching name, description, address, phone, WhatsApp, category/subcategory, product, or service text appears. The API accepts a maximum of 120 characters and rejects longer searches. (`SearchBox`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):232; `search_text`, [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):77)
3. User selects All listings, Services, or Products -> the URL gains or changes `kind` and the category grid and listing query are filtered. Services include service and both-type businesses; Products include product and both-type businesses. (`setFilter`, `Residents`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):480)
4. User clicks a category card -> browser navigates to `/categories/:slug`, `/services/:slug`, or `/products/:slug` according to the selected kind. (`Residents` category card, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):480)
5. User sees cards only for visible, non-deleted public listings. A guest cannot see hidden listings, and a logged-in owner/member can see their own hidden listing in API responses. (`BusinessViewSet.get_queryset`, [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):506)

Guest versus logged-in resident:

| Item | Guest | Logged-in resident |
|---|---|---|
| Search, category cards, subcategories, public listings | Yes | Yes |
| Phone and WhatsApp fields | Phone/WhatsApp are included for public listing responses; no guest-only mask is implemented for them. | Same public fields |
| Address | Hidden if `hide_address=true`; hidden listings and address are restricted in public representation | Members can see address on listings they manage; ordinary residents receive the same public address behavior |
| Save | Save button opens login dialog | Can add/remove saved business |
| Review | Review form opens login dialog before submission | Can submit one 1–5 star review per business |
| Call/WhatsApp | Available for public listings with valid phone fields | Available; contact action also records events with the user where authenticated |
| Internal verification/admin fields | Removed from public representation | Removed unless user is member/admin; ordinary logged-in resident is not privileged |

The public masking is implemented by `BusinessSerializer.to_representation` and listing visibility rules. ([backend/directory/serializers.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/serializers.py):449)

### A3. Category, subcategory, and filter pages

**Flow:** Category route -> category header -> nested subcategory choice -> filters -> paginated results.

1. User opens `/categories/:categorySlug/*`, `/services/:categorySlug/*`, or `/products/:categorySlug/*` -> the page loads active categories and resolves the nested subcategory path. An unknown or removed category/subcategory shows **Category not found** with a browse button. (`CategoryPage`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):720)
2. Page loads -> breadcrumb, category/subcategory header, active listing count, and direct child subcategory cards appear. (`CategoryPage` render, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):720)
3. User clicks a child subcategory -> URL becomes the nested `/category/parent/child` path. (`subcategoryPath`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):792)
4. User opens **Search and filter** -> can set search text, location, sort, minimum rating, verified-only, and price range. For products or services, price range is shown. (`applyFilters`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):804)
5. Admin-configured filter fields appear for the matching category/subcategory. Choice fields show configured choices, Boolean fields show Any/Yes/No, text fields use text input, and number fields use number input. (`CategoryPage` filter rendering, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):720)
6. User submits filters -> page parameters update and the API validates filter names, numbers, booleans, and choice values. Invalid fields receive an API error rather than an in-page filter-specific component. (`apply_category_field_filters`, [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):84)
7. Results show business cards for `/categories/*`, or product/service catalog cards for `/products/*` and `/services/*`. Cards lead to `/business/:slug`. (`CatalogCards` and `BusinessCards`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):261)
8. Results are 20 per page. Previous/Next are disabled at the first/last page. (`changePage` and pagination, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):822)

### A4. Business page

**Flow:** Listing card/category -> `/business/:slug` or listing modal -> listing details -> call/WhatsApp/save/review.

1. User clicks a listing card -> URL is `/business/:slug`, and a shell plus **listing details** dialog appear. Clicking a listing on `/mysobo` or a category page also opens a `listing` URL parameter as a modal instead of changing route. (`BusinessCards`, `ListingDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):261)
2. While loading, the dialog says "Loading business…". If unavailable, it says "Listing unavailable". (`ListingDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):342)
3. Loaded listing dialog shows name, category, verified check when `verification_level >= 2`, description, public address, phone/WhatsApp/email/website links, saved state, and reviews. (`ListingDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):342)

**Call**

1. User with a valid 10-digit-or-longer phone value clicks Call -> code records a `call` contact event -> phone handler opens. If event recording fails, no phone action occurs and an inline message appears. (`openContact`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):406)
2. For 10-digit numbers, the link uses `+91`. (`phoneHref`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):324)
3. There is no custom call-confirmation popup. It is a direct system/phone link after event recording. (`ListingDialog` Call button, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):342)

**WhatsApp**

1. User clicks WhatsApp -> code first records a `whatsapp` contact event -> app opens `https://wa.me/<digits>`. Indian 10-digit numbers use `91` prefix. (`whatsappHref`, `openContact`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):336)
2. The same valid-phone check requires at least 10 digits. Failure recording the event prevents opening WhatsApp and shows an inline error. (`ListingDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):342)

**Save**

1. Guest clicks Save -> login dialog appears; no saved record is changed until login. (`toggleSaved`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):374)
2. Logged-in user clicks Save/♡ -> `POST /api/businesses/:slug/saved/` creates or finds the saved record; button then changes to "♥ Saved". (`toggleSaved`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):374)
3. Logged-in user clicks Saved/♥ -> `DELETE` removes it; button returns to "♡ Save".
4. API success is followed by "Business saved." or "Removed from saved businesses."; failure shows the API detail or "Could not save this business." (`toggleSaved`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):374)
5. There is no saved-business list screen in the frontend. The save API also does not create an owner-facing inquiry or notification.

**Reviews**

1. Dialog shows existing reviews with author name, star rating, and optional text, or "No reviews yet. Share the first one." (`ListingDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):342)
2. Guest submits the review form -> login dialog appears. (`submitReview`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):389)
3. Logged-in user chooses 1–5 stars and optional text then submits -> API creates one review. Success text is "Thanks for sharing your review." and the form clears. (`submitReview`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):389)
4. A second review for the same business returns "You have already reviewed this business." A rating outside 1–5 is rejected. (`ReviewSerializer`, [backend/directory/serializers.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/serializers.py):612)
5. No owner reply, edit review, delete review, or review moderation UI is present.

**Report**

1. The backend supports `POST /api/businesses/:slug/report/` for authenticated users. A non-empty `reason` is required. (`BusinessViewSet.report`, [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):700)
2. The report record starts with status `open`. (`Report` model, [backend/directory/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/models.py):297)
3. No report button, report popup, success screen, or admin report queue exists in the frontend.

### A5. Login dialog

**Flow:** Header Log in or protected action -> OTP/password login dialog -> pending/error/success.

1. Guest clicks Log in or Save/review prompts login -> URL gains `dialog=login` and `LoginDialog` appears. Closing, the backdrop, or X removes only `dialog`. (`Shell`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):24)
2. The dialog title is "Log in to MySobo", with "Residents and business owners" and "Sign in with a one-time code sent to your mobile number." (`LoginDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):90)

**Mobile OTP mode**

1. User enters a mobile number and accepts "I agree to MySobo's terms and privacy policy." Send is disabled until both a non-empty number and consent are present. (`LoginDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):90)
2. Frontend uses `required` and `type="tel"`; server validation rejects characters outside digits, spaces, plus, parentheses, and hyphens, and requires an Indian 10-digit number starting in 6, 7, 8, or 9. `+91` and leading `0` are normalized. (`normalize_mobile_number`, [backend/accounts/otp.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/otp.py):59)
3. User submits -> button shows "Sending code…", request is sent to `/api/auth/otp/request/`, and button state is pending. (`requestOtp`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):90)
4. Success -> code-entry form appears. It says "Enter the 6-digit code sent to [number]". The notice is a generic delivery notice. (`OTPRequestView`, [backend/accounts/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/views.py):58)
5. Code entry accepts only digits, maximum six characters, and Verify is disabled until exactly six digits. (`LoginDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):90)
6. Code is valid for 5 minutes. Wrong or expired codes return "Invalid or expired verification code." Five wrong attempts consume the challenge. (`OTPVerifyView`, [backend/accounts/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/views.py):119)
7. Resend is disabled for 60 seconds. When the limit expires, "Resend code" becomes active. It calls the same OTP request endpoint. (`requestOtp`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):90)
8. Backend limits an OTP number to five requests per day and an IP to 30 requests per hour. Too early or too many requests returns HTTP 429 with detail text. (`OTPRequestView`, [backend/accounts/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/views.py):58)
9. Delivery failure in SMS settings returns "We could not send a code right now. Please try again later." Missing backend configuration returns "Phone sign-in is not configured. Contact support." (`OTPRequestView`, [backend/accounts/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/views.py):58)
10. User clicks Change number -> code form closes, consent resets, and mobile-entry form returns. (`LoginDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):90)

**Password mode**

1. User clicks "Use username and password instead" -> username/password form replaces OTP form. "Use a one-time code instead" returns to OTP mode. (`LoginDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):90)
2. Both username and password are required. Submit shows "Signing in…" and calls `/api/auth/login/`. (`passwordLogin`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):143)
3. Failure shows "Unable to log in." Backend username/password details come from Django REST Framework token authentication. (`mysobo/urls.py`, [backend/mysobo/urls.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/mysobo/urls.py):14)

**OTP success and return behavior**

1. A valid OTP creates a resident `User` and `Profile` if needed, stores consent version/time, creates or returns a token, and stores the token in `sessionStorage` under `mysobo-token`. (`OTPVerifyView`, [backend/accounts/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/views.py):119)
2. Password mode stores the token the same way.
3. Success invalidates React Query, refreshes `/api/auth/me/`, closes the login dialog, and leaves the user on the same route and URL parameters. (`loginComplete`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):54)
4. In production or development, OTP SMS delivery is through console, Twilio, or CI mock according to settings. Console is development-only and logs the code. (`send_login_otp`, [backend/accounts/otp.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/otp.py):59)

## B. BUSINESS OWNER (/mysobo/owner)

### B1. Becoming an owner

**Flow:** Login -> `/mysobo/owner` -> find existing listing and claim, or create/listing.

1. Guest opens `/mysobo/owner` -> intro page appears plus **Sign in to continue** and Log in. (`OwnerPortal`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):954)
2. Logged-in user sees listings owned through `BusinessMember`, claim search/results, create listing form, offer form, and plan request form. (`OwnerBusinessesView`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):46)

**Claim an existing listing**

1. User types at least 2 search characters -> API searches unmembered, non-deleted businesses and returns at most 20 matches. (`OwnerClaimableBusinessesView`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):88)
2. User clicks Claim next to a result -> claim is created with status `pending`; UI shows "Claim submitted. We will update its status after verification." (`OwnerClaimsView.post`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):56)
3. Duplicate claims while pending are rejected with "Your claim is already awaiting review." If the user already manages it, "You already manage this business." (`OwnerClaimsView.post`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):56)
4. A separate listing-detail claim API can auto-approve if the resident profile mobile exactly equals the listing phone. Otherwise it creates a pending claim. The owner portal UI itself does not use this listing-detail claim endpoint. (`BusinessViewSet.claim`, [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):664)
5. Admin approves -> claim status becomes `approved`, a `BusinessMember` owner record is created, and listing verification level is raised to at least 1. Admin rejects -> status becomes `rejected`, no membership is created. (`AdminClaimsView.post`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):180)

**Create a listing**

1. Logged-in user fills **Add your business** and clicks Create listing. (`BusinessForm`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1258)
2. Frontend generates a slug from business name plus a timestamp; API stores `source="owner"`, `verification_level=0`, `hidden=true`, and an owner `BusinessMember`. (`perform_create`, [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):621)
3. Success -> "Your listing was created and is awaiting verification." The form resets. (`createBusiness`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):999)
4. Owner remains able to see and edit the listing while it is hidden from public search. (`OwnerBusinessesView`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):46)

### B2. Status meanings

| Status or level | Current meaning | Visible to residents | Evidence |
|---|---|---|---|
| `verification_level=0` | New owner-created listing, not yet approved | Hidden | `perform_create`, [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):621 |
| `verification_level=1` | Claimed or field-entered; owned/claimed stage | Field-agent entry also starts hidden; a claim approval does not itself make public | `AdminClaimsView.post` and `AdminBusinessesView.post`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):180 |
| `verification_level=2` | Explicitly verified by super-admin | Public; verified check badge is shown | `AdminBusinessVerifyView`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):405 |
| Under review | Frontend label for owner listings whose `verified` is false | Hidden owner-created listing | Owner row status, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1039 |
| Verified | Frontend label for `verified=true` (`level >= 2`) | Public if `hidden=false` | `get_verified`, [backend/directory/serializers.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/serializers.py):446 |
| Hidden/rejected | A verification rejection sets hidden=true; it does not lower verification level or change a separate rejection status | Hidden | `AdminBusinessVerifyView`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):405 |
| Claim pending/approved/rejected | Claim lifecycle | Pending/approved/rejected text in owner claim list | `Claim.Status`, [backend/directory/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/models.py):217 |
| Offer pending/approved/rejected | Offer/post lifecycle | Owner sees status; public UI shows no approved-offer surface | `BusinessPost.Status`, [backend/directory/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/models.py):252 |

The code does not implement separate resident labels such "Listed", "Claimed", or "Documented"; only verification level and hidden/verified are used. (`Business` model, [backend/directory/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/models.py):98)

### B3. Owner portal screens and tabs

The owner portal is a set of stacked sections, not separate tabs.

**Overview/listings**

1. Logged-in owner sees **Business status** rows: business name, category, plan, and Verified/Under review status. Selecting a row opens the Edit listing details disclosure. (`OwnerPortal`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):954)
2. If no listings exist, it says "No claimed listings yet."

**Listings**

1. Owner expands Edit listing details -> name, category, type, subcategory, dynamic fields, description, phone, WhatsApp, and address are shown. (`EditBusinessForm`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1230)
2. Submit -> API patch -> "Listing details updated." or API error in the shared feedback line. (`perform`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):987)

**Create/edit fields and validation**

| Field | Create/edit | Required | Validation |
|---|---|---|---|
| Business name | Both | Yes | Frontend `required`, max 200 create; backend model max 200 |
| Type | Both | API default service; UI has selection | Service, Product, or Both; category/subcategory must support selected type |
| Category | Both | No in UI/API optional | Must be a valid category and support type |
| Subcategory | Both | Optional | Must belong to category, be active/approved, and support type |
| Category-specific fields | Both | Dynamic per admin configuration | Required, text, number, boolean, or choice rules enforced |
| Description | Both | No | Text |
| Phone | Both | No | Text in frontend; no phone-format validation in owner/API listing serializer |
| WhatsApp | Both | No | Text in frontend; no phone-format validation in owner/API listing serializer |
| Address | Both | No | Text |
| Slug | Create only | Generated | Name/timestamp slug frontend; API has model unique slug |
| Plan, hidden, source, verification level | Not editable by owner | Read-only | Read-only fields in `BusinessSerializer` |

Dynamic field behavior and validation are in `BusinessClassificationFields` and `validate_category_data`. ([frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1140; [backend/directory/serializers.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/serializers.py):28)

There is no verification-level-specific edit UI: the owner can patch editable fields if member or super-admin. `IsAdminOrMember` allows super-admin/verifier or business member updates. ([backend/directory/permissions.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/permissions.py):24)

**Offers**

1. Owner chooses owned business, title, and details, then submits **Submit offer**. (`submitPost`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1014)
2. Business, offer title, and details are required. Title is max 200. API creates status `pending`. (`BusinessPostSerializer`, [backend/directory/serializers.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/serializers.py):626)
3. Success -> "Offer sent for review." and form resets.
4. Owner sees each submitted offer title and status text.
5. No limits are enforced by plan in the offer API or UI.
6. No approved/rejected transition UI or public offers screen exists in the frontend. Although `pending_posts` is in the admin dashboard and offers have approved/rejected states in data, no admin offer queue endpoint or action is wired. (`AdminDashboardView`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):162)

**Plans/billing**

1. Owner chooses a listing and plan, then clicks **Request plan change**. (`submitPlan`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1023)
2. Plans are returned only if `PlanPrice.active=true`. Seed launch prices are Free ₹0, Pro ₹499/month, and Premium ₹1999/month. (`seed_mysobo`, [backend/directory/management/commands/seed_mysobo.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/management/commands/seed_mysobo.py):391)
3. API accepts Free, Pro, or Premium and rejects a plan that is unknown or inactive.
4. Duplicate pending plan requests return "A plan request is already awaiting review."
5. Success -> "Plan request submitted for approval." (`OwnerPlansView`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):124)
6. Owner sees plan request rows: requested plan and status.
7. Owner also receives subscription rows but the frontend does not render subscription status or expiry; it only renders plan request status.

**What plan levels unlock today**

- The code defines Free, Pro, and Premium, but stores no plan-specific feature matrix.
- There is no enforcement for offers, listing edits, photos, products, services, contact details, search ranking, or verification based on plan.
- The `free_pro_cap=100` and `grace_days=7` seed settings are not read by application code.
- A paid plan request is only a request. Approval creates a `trial` Subscription record and changes `Business.plan`; it does not set start/expiry/grace dates or create a payment.
- Manual payment recording changes the listing to an active plan with expiry 30 days from payment. It creates an invoice and audit entry.
- Not built yet: online checkout, trial rules, expiry automation, grace enforcement, renewal, reminder, lapse downgrade, and plan-specific locked screens.

### B4. Owner popups, confirmations, and feedback

- Login dialog, listing edit `<details>` disclosure, and inline feedback are the only owner popups/disclosures.
- Shared feedback shows `formError` or `successMessage` below the owner sections.
- Claim, create, offer, and plan actions do not use confirmation dialogs.
- Save, update, claim, offer, plan, and plan/owner API failures show returned API detail text or generic fallback text.
- Evidence: `perform` and `PortalFeedback`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):987

## C. SUPER ADMIN (/mysobo/superadmin)

### C1. Access and role decisions

**Flow:** Open `/mysobo/superadmin` -> guest sign-in state, regular-user restricted state, or super-admin dashboard.

1. Guest -> **Admin sign-in required** and Log in. (`SuperAdminPortal`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1532)
2. Logged-in regular user -> **Access restricted**. (`SuperAdminPortal`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1532)
3. Logged-in user with `AdminRole(role="super_admin")` -> dashboard and admin operations. Frontend also has no Django `is_superuser` fallback for the nav flag; it uses `PortalUser.is_superadmin`, returned from `AdminRole`.
4. API checks use `IsSuperAdmin`, which accepts a super-admin `AdminRole` or Django superuser RLS helper. In the frontend admin API, every admin endpoint is guarded separately. ([backend/directory/permissions.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/permissions.py):38)
5. Django role choices also include Field agent, Verifier, and Finance. These roles exist in `AdminRole`, but the super-admin portal/API endpoints require the `super_admin` role, so field-agent/verifier/finance-only users do not gain the super-admin UI. ([backend/accounts/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/models.py):45)
6. PostgreSQL RLS is enabled for listings, categories, claims, reports, payments, subscriptions, and audit data. Public, owner/member, and super-admin policies are migration-defined. ([backend/directory/migrations/0007_postgresql_row_level_security.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/migrations/0007_postgresql_row_level_security.py):120)

### C2. Dashboard metrics

1. Super-admin loads dashboard -> API counts all non-deleted businesses, unverified businesses (`level < 2`), pending claims, pending offers/posts, pending plan requests, and total payments. (`AdminDashboardView`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):162)
2. UI displays each returned metric as a card with label and count. It has no date filters or drill-down.

### C3. Verification queue

**Flow:** Verification queue -> view unverified row -> Verify or Reject -> saved state -> resident/owner result.

1. Admin sees **Businesses awaiting review**. Rows include name, source, and phone. (`SuperAdminPortal`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1532)
2. Admin clicks Verify -> `POST /api/admin/businesses/:id/verify/` with `decision=verify`.
3. API sets `verification_level=2`, sets `verified_by`, sets `verified_on`, sets `hidden=false`, saves, and creates an `AuditLog` with before/after. ([backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):405)
4. UI success: "Business verified."
5. Verified listing becomes public and resident card shows the verified badge. 
6. Admin clicks Reject -> API sets `hidden=true` and saves optional verification note; UI sends no note field. API writes an audit entry. UI success: "Listing hidden."
7. Rejected listing remains non-public. The resident, owner, and admin UI do not show a dedicated rejection status, only hidden/under review in relevant screens.
8. No confirmation popup or bulk action exists.

### C4. Owner claims

**Flow:** Claims panel -> pending claim row -> Approve or Reject -> membership/status update.

1. Admin sees only pending claim rows: business, requested username, and proof path if present.
2. Admin clicks Approve -> claim becomes approved, reviewed by/time are saved, owner `BusinessMember` is created, and claim-approved listing level is raised to at least 1.
3. Admin clicks Reject -> claim status becomes rejected and note/reviewer/time are saved. UI does not provide a note field.
4. UI success text is "Claim approved." or "Claim rejected."
5. Audit entry: Not written for claim approval/rejection in `AdminClaimsView`.
6. Approved owner can see/manage listing in `/mysobo/owner`; reject removes no existing member or listing. It does not make the listing public.

### C5. Plan requests

**Flow:** Plan requests panel -> pending request -> Approve or Reject.

1. Admin sees pending request, business, and requested plan.
2. Approve -> request becomes approved/reviewer is saved -> a Subscription is created with status `trial`, `trial=true`, start time, and no expiry/grace values -> listing `plan` is changed to requested plan.
3. UI success: "Plan request approved."
4. Reject -> request becomes rejected/reviewer is saved; no subscription or listing plan change occurs. UI success: "Plan request rejected."
5. No confirmation popup or note field exists.
6. Audit entry: Not written for plan request approve/reject.

### C6. Pricing

1. Admin selects a plan and enters monthly price in rupees plus Active availability checkbox, then Save plan.
2. API requires a valid plan (`free`, `pro`, `premium`) and integer, non-negative price.
3. Active is sent true/false. API saves `PlanPrice` and records the updater.
4. UI success: "Plan pricing updated."
5. Owner plan selector reads only active prices.
6. No plan feature or display-description fields exist.
7. Plan price changes have no separate audit entry.

### C7. Payment recording

**Flow:** Payment control -> choose business/plan -> enter amount/GST/method/reference -> Record.

1. Admin chooses a business and plan.
2. Admin enters amount, GST, method (default `manual`), and optional gateway reference.
3. UI converts rupees to paise and validates amount/GST as numbers.
4. API requires valid plan, non-negative integer amount/GST, and non-empty method.
5. API creates an active Subscription with:
   - start time now
   - expiry now plus 30 days
   - plan
   - status `active`
6. API creates a `Payment` with status `paid`, paid time now, method, and gateway reference. A blank reference becomes `manual-<uuid>`.
7. API creates an invoice number `MS-<12 hex chars>` and issue date.
8. API updates `Business.plan` and `Business.plan_expires_on`.
9. Audit entry `payment_recorded` is created with business, plan, amount in paise, and status.
10. UI success: "Payment recorded and access updated." Form resets. Recent payments show business, plan, amount, and status.

### C8. Directory management

**Flow:** Directory panel -> categories/subcategories/fields -> add or edit -> save/deactivate.

**Categories**

1. Admin searches categories by name/slug.
2. Add category form: Name required; Description, optional slug, display order (default 0), listing type (Product/Service/Both), icon name, icon image, category image, and Active checkbox.
3. Category slug is optional; backend generates it from name and resolves collisions by suffix.
4. Category must support at least Product or Service.
5. Edit category is in a collapsible row: all fields plus Active and Save category.
6. Deactivate button only appears for active categories and sends `DELETE`, which backend converts to `active=false`; it is not physical deletion.
7. Success: "Category added.", "Category updated.", or "Category deactivated."

**Subcategories and nested levels**

1. Admin chooses main category and optional parent subcategory, enters Name, Description, optional slug, display order, listing type, icon, image, and Active.
2. Backend requires same category for parent, blocks cycles/self-descendant nesting, requires a supported type, and blocks moving a category if it has children.
3. Slug is optional on create and generated from name; edit requires the slug field.
4. Save/update or Deactivate works the same as categories; Deactivate is a soft inactive state.
5. Success text is "Subcategory added.", "Subcategory updated.", or "Subcategory deactivated."

**Category fields**

1. Admin chooses category, optional subcategory scope, label, optional key, field type, choice options, applies-to, display order, and Required/Filterable/Active checkboxes.
2. Choice fields require at least one choice option.
3. A subcategory field must belong to the selected category.
4. Field key is optional and generated from label, with collision suffixing.
5. Save or Deactivate. Backend Deactivate means active=false.
6. Success: "Category field added.", "Category field updated.", or "Category field deactivated."

Taxonomy actions have no confirmation popup. (`CategoryManager`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1316)

### C9. Field-agent entry

**Flow:** Field-agent entry form -> fill listing/type/category -> Save field entry -> hidden awaiting verification.

1. Admin enters name (required), type/category/subcategory/dynamic fields, description, phone, WhatsApp, address.
2. Save -> API creates `source="field_agent"`, `verification_level=1`, `hidden=true`, and `created_by=admin`.
3. UI success: "Field entry created. It is awaiting full verification."
4. An audit entry `field_business_entry` is written.
5. Listing is not public until admin verification sets level 2 and hidden false.

### C10. CSV import

**Flow:** Open Import listings from CSV -> choose UTF-8 CSV -> Validate and import -> all-or-nothing save.

1. File limit: 5 MB and maximum 500 rows.
2. Required headers: `name`, `kind`, `category_slug`. Optional: `slug`, `subcategory_slug`, `phone`, `whatsapp`, `address`, `description`, `category_data`.
3. Kind must be `service`, `product`, or `both`. Category slug must be active. Subcategory slug must be active/approved in category.
4. Every row is validated before creation. Duplicate/extra/missing/invalid values return row-specific errors and prevent all import rows from being saved.
5. Successful rows become field-agent listings with level 1, hidden=true, source field agent.
6. UI success: "CSV import completed. Imported listings are hidden until verified."
7. Audit entry `business_csv_import` stores created count and business IDs.

## D. CROSS-CUTTING

### D1. Roles and permissions

| Role or user | Public discovery | Login/save/review | Own listing edit | Create listing/claim/offer/plan | Super-admin portal |
|---|---|---|---|---|---|
| Guest | Read active categories and public listings/products/services | Save/review triggers login; contact events allowed | No | No | No |
| Logged-in resident | Same public discovery | Save, review once/business, contact event linked to user | Only if BusinessMember | Owner portal actions require membership for edit; can create own listing and claim | No |
| Business owner/manager member | Public discovery; hidden owned listings visible to member | Resident actions | Member/manager can use listing update API; UI owner portal lists member listings | Claim/create/offer/plan if authenticated; offers/plan also require member of chosen listing | No |
| Field agent role | Public discovery | Resident actions | No special listing-edit portal coded; role exists | No role-specific UI/API is wired | No |
| Verifier role | Public discovery | Resident actions | API verifier permission can update listing objects | No role-specific UI/API is wired | No |
| Finance role | Public discovery | Resident actions | No | No role-specific UI/API is wired | No |
| Super-admin | Unrestricted admin discovery and public actions | Resident actions | Manage listings and catalog | Claim/plan/verification/payment operations | Yes |
| Django superuser | API RLS/admin compatibility; frontend nav uses AdminRole flag | Resident actions | Manage under RLS helper | Admin API via RLS helper | Frontend requires `is_superadmin` value derived only from `AdminRole` |

Evidence: `IsAdminOrMember`, `IsVerifier`, `IsSuperAdmin` ([backend/directory/permissions.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/permissions.py):24); role model ([backend/accounts/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/models.py):45); RLS ([backend/directory/migrations/0007_postgresql_row_level_security.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/migrations/0007_postgresql_row_level_security.py):120).

### D2. Data model summary

| Area | Main table | Plain-language purpose | Important fields |
|---|---|---|---|
| Account | `User` | Login identity | UUID, username, mobile, active, Django auth fields |
| Account | `Profile` | Resident profile | mobile, society, consent time/version, deleted time |
| Account | `OTPChallenge` | Short-lived SMS login code | mobile, code hash, IP, attempts, expiry, consent |
| Account | `AdminRole` | Staff role assignment | user, role |
| Society | `Society` | Society/location record | name, area |
| Directory | `Category` | Main category | name, slug, active, service/product support, icon/image, priority |
| Directory | `Subcategory` | Nested subcategory | parent, category, approved, active, type support |
| Directory | `CategoryField` | Dynamic category form/filter field | key, label, type, choices, required/filterable, applies-to |
| Directory | `Business` | Main listing | name, slug, kind, category, location/address, contact, verification, hidden, plan, expiry |
| Directory | `BusinessMember` | Owner/manager relation | user, business, role |
| Directory | `Claim` | Ownership claim | business, user, proof path, pending/approved/rejected, reviewer |
| Directory | `BusinessPost` | Offer/update | business, title, body, pending/approved/rejected |
| Directory | `BusinessProduct` | Product catalog record | business, category, name, brand, model, price, availability |
| Directory | `BusinessService` | Service catalog record | business, category, name, area, experience, price range |
| Directory | `BusinessHour`, `BusinessPhoto` | Opening hours and photos | hours/day, photo path |
| Resident activity | `SavedBusiness`, `Review`, `Report` | Saved listings, ratings, abuse reports | user/business/reason/rating/status |
| Analytics | `Event`, `EventDaily` | Call/WhatsApp events and daily aggregation | business, user, type, date/count |
| Audit | `AuditLog` | Admin change record | actor, action, target, before/after/time |
| Billing | `PlanPrice` | Configurable monthly price | plan, monthly price in rupees, active |
| Billing | `Subscription` | Business plan state | business, plan, trial/active/grace/expired, dates |
| Billing | `SubscriptionRequest` | Paid-plan request | business, requester, requested plan/status |
| Billing | `Payment`, `Invoice`, `AppSetting` | Payment/invoice and settings | paise/GST/method/status, invoice number, key/value settings |

Evidence: [backend/directory/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/models.py):1, [backend/accounts/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/models.py):1, [backend/billing/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/billing/models.py):1.

### D3. Route map

| Route | Allowed/visible role | Screen name | Main actions |
|---|---|---|---|
| `/` | Anyone | Redirect | Redirect to `/mysobo` |
| `/mysobo` | Anyone | Resident home | Search, type tabs, category/subcategory browse, listing modal |
| `/mysobo?dialog=login` | Anyone | Login dialog | OTP/password login |
| `/mysobo/owner` | Guest: sign-in gate; authenticated: owner | Owner portal | Claim/create/edit listing, offer, plan request |
| `/mysobo/superadmin` | Guest: sign-in gate; regular user: restricted; super-admin: full | Operations portal | Metrics, verification, claims, plans, pricing, payment, taxonomy, import |
| `/services/:categorySlug/*` | Anyone; public listings | Service category page | Search/filter/sort/paginate; open listing |
| `/products/:categorySlug/*` | Anyone; public listings | Product category page | Product search/filter/sort/paginate; open listing |
| `/categories/:categorySlug/*` | Anyone; public listings | All category page | All-type search/filter/sort/paginate; open listing |
| `/business/:slug` | Anyone; public listing or owner/admin privileged | Listing details | Call, WhatsApp, save, review, close |
| Unknown route | Anyone | Redirect | Redirect to `/mysobo` |

Evidence: `App` routes [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1721.

### D4. Notifications and messages

Today, the app sends no in-app notification feed, push notification, email, or SMS decision notice.

- SMS is sent only for login OTP; it contains the code and expiry. ([backend/accounts/otp.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/otp.py):59)
- Claim, offer, plan, verification, and payment outcomes appear as screen refresh/status text only.
- The UI uses inline success/errors and API field text rather than toasts or notification centers.
- Call/WhatsApp actions create `Event` records, but no user notification is sent. ([backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):651)

### D5. Gap and issue list

| Severity | Gap/problem | Evidence |
|---|---|---|
| High | No approved-offer admin queue or public offer display exists, although pending offers and approved/rejected states exist in the model and dashboard count. | `BusinessPost` model [backend/directory/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/models.py):252; owner/admin UI [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1014 |
| High | Plan feature unlocking does not exist. Free/Pro/Premium are labels and prices only; no code blocks or grants features. | `OwnerPlansView`, [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):124 |
| High | Approval lifecycle is inconsistent: claim approval raises level 1 but does not verify/publicate; plan approval creates trial with no expiry; verification alone makes public. | Claim/plan/verify endpoints [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):180 |
| High | Audit entries are missing for claim decisions and plan decisions; taxonomy, offer, and owner listing edits are also not audited. | `AuditLog` writes [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):231 |
| High | Report endpoint exists but residents cannot open it from listing UI and admins have no report queue/panel. | `BusinessViewSet.report` [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):700 |
| High | Deactivate buttons and Verify/Reject/Approve/Reject actions have no confirmation or undo. | `CategoryManager` and super-admin row actions [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1316 |
| Medium | No saved-business list, so residents can save items but cannot find their saved list from the navigation. | Save API [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):713 |
| Medium | No owner replies, review edit/delete, review moderation, or resident abuse reporting UI. | `ListingDialog` [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):342 |
| Medium | Field-agent, verifier, and finance roles exist but have no role-specific portal, so only super-admin can perform portal operations. | `AdminRole.Role` [backend/accounts/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/models.py):45 |
| Medium | Resident address, phone masking rules are inconsistent: hidden address is explicit, but public phone/WhatsApp/email/website are not masked for guests. | `to_representation` [backend/directory/serializers.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/serializers.py):449 |
| Medium | `grace_days`, `free_pro_cap`, and `claim_sla_hours` are seeded but unused, and plan lapsed status is not enforced. | `seed_mysobo` [backend/directory/management/commands/seed_mysobo.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/management/commands/seed_mysobo.py):391 |
| Medium | Owner listing status uses only Verified/Under review; claim-approved level 1 and rejection reasons are not explained. | `OwnerPortal` [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1039 |
| Medium | Admin claim reject and plan reject calls send no note, while backend can store claim note. | Admin claim UI [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):1532 |
| Medium | CSV import result is inline; there is no downloadable or persisted row-error report. | `AdminBusinessImportView` [backend/directory/portal_views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/portal_views.py):244 |
| Medium | Search and listing API can accept a category slug/name mismatch or malformed parameters; UI handles main category/loading errors but custom filter API errors do not map to each field. | `apply_category_field_filters` [backend/directory/views.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/views.py):84 |
| Low | Logout API failure leaves the user and token in the current session and shows a top error. | `logout`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):37 |
| Low | Login dialog mode toggle can switch between OTP and password without clearing mobile/code on some transitions. | `LoginDialog`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):90 |
| Low | Top nav labels "Residents" and "For businesses" are less descriptive of `/mysobo/owner` than "Resident directory" and "Business owner". | `Shell`, [frontend/src/App.tsx](/C:/Users/SANIYA/OneDrive/Desktop/sobo/frontend/src/App.tsx):24 |
| Low | No society selection in resident UI despite Society model fields. | [backend/accounts/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/accounts/models.py):10 |
| Low | No staff/manager invite flow; BusinessMember model exists but UI has no member management. | `BusinessMember` [backend/directory/models.py](/C:/Users/SANIYA/OneDrive/Desktop/sobo/backend/directory/models.py):204 |

---

# Part 2: FUTURE RECOMMENDATIONS (PROPOSED, NOT BUILT)

These are proposals, not claims about current code behavior.

## 1. Clear Free vs Upgraded owner experience

**Name:** Plan choice at claim/create  
**For:** Business owners and super-admins  
**Problem:** Owners currently have no plan comparison and no enforced differences.

**User flow**

1. User begins claim or create listing -> screen chooses **Continue with Free** or **Compare and upgrade**.
2. User selects Free -> listing can be created/claimed and marked Free. Existing listing remains subject to verification.
3. User selects upgrade -> plan comparison opens with Free/Pro/Premium, monthly price, monthly benefits, and one clear primary button.
4. User chooses a plan -> request summary appears; current flow submits approval request. A later online-payment flow shows payment method, GST, invoice preview, payment result, and receipt.
5. The owner sees Pending approval/Payment pending/Active/Expiring/Expired/Grace state.

**Proposed locked items on Free**

- No current code unlock matrix exists. Founder must define actual locks.
- Strong candidates: enhanced photos, offers, richer catalog, search placement, lead inbox, stats, website link prominence, contact conversion tools.
- Always keep basic listing, public search, call/WhatsApp, and verification visible unless founder chooses otherwise.

**Plan operations later**

- Trial: start/end date, optional eligibility, cancel.
- Renewal: remind 15/7/1 days before expiry, payment retry, renewed active date.
- Grace: status and grace end date.
- Lapse: downgrade to Free or keep listing public but remove paid features, according to founder policy.
- Add plan confirmation, payment failure, refund, cancellation, and expiry reminders.

**Service vs Product**

- Service owners see service catalog limit, service area, experience, price range, enquiry alerts.
- Product owners see product limit, inventory/availability, brand/model, price, and stock presentation.
- Shared tools remain plan-based rather than kind-based.

**Screens/popup**

- Plan choice card
- Comparison modal
- Upgrade request summary
- Payment checkout (later)
- Payment success/failure
- Renewal/expiry/grace banners
- Feature lock tooltip/modal

**Effort:** Large  
**Priority:** Now

## 2. Owner growth dashboard

**Name:** Listing insights and enquiry inbox  
**For:** Owners  
**Problem:** The owner sees status but no value/actionable growth data.

**Flow**

1. Owner opens Overview -> summary cards show listing views, calls, WhatsApp, saves, and inquiries.
2. Owner selects date range/listing -> trend graph and action breakdown appear.
3. Owner opens Enquiry Inbox -> unread and resolved leads list; owner taps item for details and reply/call action.
4. User chooses **Mark as resolved** or adds note.
5. No-contact or system-generated alerts appear on owner nav, email, or SMS only after founder chooses channels.

**Screens/popup:** Overview metrics, insight drill-down, inbox list/detail, enquiry response, notification preferences.

**Effort:** Large  
**Priority:** Next

## 3. Better offer tools

**Name:** Visual offer builder and scheduling  
**For:** Owners and admins  
**Problem:** Current offers have only title/body and no admin approval screen.

**Flow**

1. Owner opens Offers -> existing drafts/offers/status list.
2. New offer -> title, details, image, start/end date, and audience/listing.
3. Plan limit warns and explains upgrade.
4. Submit -> pending review.
5. Admin approves/rejects with reason.
6. Approved offer appears on listing/public card and can be scheduled or ended.

**Screens/popup:** Offer list, builder, limit warning, approval reason, scheduled/published/expired states.

**Effort:** Medium  
**Priority:** Next

## 4. Profile completeness

**Name:** Listing readiness checklist  
**For:** Owners  
**Problem:** Owners do not know which missing details block trust or conversion.

**Flow**

1. Owner dashboard shows progress percentage.
2. Checklist lists category, phone, description, address, photos, hours, category fields, offers, and verification documents.
3. User selects missing item -> opens matching edit section.
4. Saving updates progress; verification state updates when evidence is complete.

**Effort:** Small  
**Priority:** Now

## 5. Staff and manager roles

**Name:** Listing team management  
**For:** Owner and manager  
**Problem:** `manager` role exists but there is no invite or staff management UI.

**Flow**

1. Owner opens Team -> Team member list.
2. Invite -> enter mobile/email, choose Owner/Manager/Viewer or founder-approved roles.
3. Invite shown pending until accepted.
4. Accepted user gets only granted actions.
5. Owner can revoke or resend.

**Effort:** Medium  
**Priority:** Next

## 6. Resident saved and preference experience

**Name:** Saved directory, preferences, and society  
**For:** Residents  
**Problem:** Saved records have no list; society/profile preferences are absent in UI.

**Flow**

1. Guest clicks Save/Review -> login and return to the same listing.
2. Logged-in resident opens Saved -> saved listing list/folders appear.
3. Resident profile asks for society, area, preferred categories, and notification preferences.
4. Home/search can highlight nearby/society listings without hiding national/out-of-area items.

**Screens/popup:** Saved list, account profile, society chooser, preference settings.

**Effort:** Medium  
**Priority:** Next

## 7. Resident login timing and limits

**Name:** Guest benefit-gated login prompts  
**For:** Residents  
**Problem:** Login appears only at Save/Review today; guest limits are not clearly communicated.

**Flow**

1. Guest can browse/search/call/WhatsApp as founder permits.
2. At Save/Review/Inbox/Society-preference action, show concise value: "Sign in to save this business."
3. Login success returns to the original action and automatically completes it.
4. Logged-in-only or repeated limits show a clear screen rather than a generic API error.

**Effort:** Small  
**Priority:** Now

## 8. Reviews and owner replies

**Name:** Full review lifecycle  
**For:** Residents and owners  
**Problem:** No edit/delete/reply/moderation/report experience.

**Flow**

1. Resident posts review -> owner receives review alert.
2. Owner opens review -> can reply once or request correction.
3. Resident sees public reply and can edit/delete own review.
4. Reported review enters abuse queue.

**Effort:** Medium  
**Priority:** Next

## 9. Listing report flow

**Name:** Report listing  
**For:** Residents and super-admin  
**Problem:** Backend report is inaccessible to the UI.

**Flow**

1. Resident opens listing/menu -> Report listing.
2. Chooses reason and optional details.
3. Confirms; success says report submitted.
4. Admin sees report queue with status, reason, listing, reporter, and timestamps.
5. Admin resolves, hides listing, or dismisses, with required reason.

**Effort:** Medium  
**Priority:** Now

## 10. Trust levels and verification progress

**Name:** Listed/Claimed/Verified/Documented trust ladder  
**For:** Residents and owners/admin  
**Problem:** Current UI uses a boolean Verified badge and numeric level, which is unclear.

**Flow**

1. Owner opens verification tracker -> steps: Listed, Claimed, Verified, Documented.
2. Each step has explanation, evidence, status, and action.
3. Documented owner uploads proof/registration/document with sensitive fields.
4. Admin reviews evidence and marks verification step.
5. Public listing shows earned trust badges and "Learn about verification".

**Screens/popup:** Trust badge explanation, document upload, progress tracker, admin evidence view, rejection reason.

**Effort:** Large  
**Priority:** Next

## 11. Super-admin queues and SLA

**Name:** Operations control center  
**For:** Super-admin, verifier, finance, field agent  
**Problem:** Admin has flat panels, no filters, sorting, bulk actions, or SLA.

**Flow**

1. Admin opens queue -> pending items, age, priority, listing, requester.
2. Filters by status/role/category/age/source.
3. User selects bulk items -> verify/approve/reject with shared reason.
4. SLA timer and overdue highlight guide action priority.

**Screens/popup:** Queue filter bar, bulk confirm, rejection reason, SLA detail.

**Effort:** Large  
**Priority:** Now

## 12. Audit log and role management

**Name:** Audit and staff permissions  
**For:** Super-admin  
**Problem:** Audit writes exist but no viewer; role choices exist but no management UI.

**Flow**

1. Admin opens Staff -> assign Field agent/Verifier/Finance/Super-admin role.
2. Admin opens Audit log -> actor/action/date/target/before/after filters.
3. Export or open detail drawer.
4. Sensitive operations require confirmation.

**Effort:** Medium  
**Priority:** Now

## 13. Revenue and plan reporting

**Name:** Billing analytics  
**For:** Super-admin/finance  
**Problem:** Payments are listed only in a short list.

**Flow**

1. Admin opens Revenue -> total paid, GST, plan mix, active subscriptions, expiry, churn, refunds.
2. Filter date/plan/status/payment method.
3. Open a payment to see invoice and subscription.

**Effort:** Medium  
**Priority:** Next

## 14. Duplicate merge

**Name:** Listing duplicate detection and merge  
**For:** Super-admin/field agents  
**Problem:** CSV/manual entry can create duplicate listings.

**Flow**

1. Admin creates/imports listing -> matches by name/phone/address appear.
2. Admin compares cards and chooses primary.
3. Merge confirmation moves claims, reviews, saved records, posts, catalog entries, and contact events.
4. Duplicate is hidden and merge is audited.

**Effort:** Large  
**Priority:** Next

## 15. Better search and filters

**Name:** Discovery quality improvements  
**For:** Residents  
**Problem:** Search is text-only, location is weak, and filter state can be unclear.

**Flow**

1. Resident opens search -> recent searches and category suggestions.
2. Search supports typo tolerance, autocomplete, area, open-now, and verified/rating.
3. Filter chips show active choices; clear-all resets.
4. Sort and empty state explain how to broaden.

**Effort:** Medium  
**Priority:** Next

## 16. Listing completeness and catalog tools

**Name:** Hours, photos, products, and services manager  
**For:** Owners  
**Problem:** Backend supports hours/photos/product/service records, but owner UI does not expose them.

**Flow**

1. Owner opens listing -> tabs for Details, Hours, Photos, Products/Services.
2. Add/edit/disable entries.
3. Dynamic category fields appear.
4. Changes go pending or publish based on verification policy.

**Effort:** Large  
**Priority:** Now

## 17. Lapse, refund, and renewal rules

**Name:** Paid-plan lifecycle  
**For:** Owners, finance, super-admin  
**Problem:** Subscription status, grace, expiry, and refunds are modeled but not enforced or displayed.

**Flow**

1. System marks grace/expired dates.
2. Owner receives warning banners and reminders.
3. Grace preserves paid features until grace end.
4. Expiry downgrades or locks the founder-approved feature set.
5. Refund/reversal screen restores or reverses entitlements and is audited.

**Effort:** Large  
**Priority:** Next

---

# Part 3: OPEN QUESTIONS

1. What exactly is included in Free, Pro, and Premium? Use benefits and feature limits, not just prices.
2. Can guests see phone numbers, WhatsApp, email, website, and exact address, or should login reveal some fields?
3. What is the owner verification ladder: how does level 1 become level 2, and what does rejected mean?
4. Is approval the same as claiming, or are claim and full verification separate stages?
5. Which listing fields can owners edit after verification, and what requires re-review?
6. What is the plan approval/trial duration? Can an approved request be used before payment?
7. Is the plan 30-day or calendar-month, and what timezone defines expiry?
8. What happens on plan lapse: immediate downgrade, grace period, or listing remains public?
9. Should refunds, chargebacks, invoice reversal, and payment deletion be possible, and who can do them?
10. Are offers free or paid? What offer limits, size, validity, and public placement are allowed?
11. Are offers automatically visible after approval or scheduled/placed manually?
12. Will owner-created listings and offers remain private while pending review?
13. What counts as a valid claim proof, and can residents submit proof in the owner portal?
14. Will mobile-number auto-claim remain based on exact phone match, or should it require evidence?
15. What staff roles exist for real operations, and what permissions should Field agent, Verifier, and Finance each have?
16. Can an owner invite Manager/Staff users? What actions can each role perform?
17. Should residents have saved folders/lists and society preferences?
18. Are society selection and location ranking in scope for launch?
19. Can residents edit/delete reviews and can owners reply?
20. What report reasons, resolution workflow, and listing-hide rules are required?
21. Are phone/WhatsApp contact events visible to owners, and should owners receive lead alerts?
22. Is call/WhatsApp tracking privacy-safe and consented, and how long is event data kept?
23. Should Product and Service offer tools and plan limits differ?
24. What document types prove ownership or business authenticity?
25. Is verification free or tied to paid plans?
26. What audit events must exist for claims, offers, listing edits, taxonomy, deactivation, login, and refunds?
27. What are desired SLA targets and overdue escalation rules?
28. How should duplicate listings be identified and merged?
29. What CSV validation and import approval behavior is desired for field agents?
30. Is the app production-ready for accessibility and responsive mobile UX before design handoff?

---

# Screens checklist for the designer

| Role | Route/surface | Screen, popup, or state | Desktop | Mobile |
|---|---|---|---|---|
| Resident | `/` | Redirect/initial loading | Note | Note |
| Resident | `/mysobo` | Home hero, search, type tabs | Draw | Draw |
| Resident | `/mysobo` | Popular category grid, category loading, category error, empty categories | Draw | Draw |
| Resident | `/mysobo` | Listing results, loading, API error, retry, empty results | Draw | Draw |
| Resident | `/services/:slug/*` | Service category header, breadcrumbs, nested subcategories | Draw | Draw |
| Resident | `/products/:slug/*` | Product category header, breadcrumbs, nested subcategories | Draw | Draw |
| Resident | `/categories/:slug/*` | All-type category header, breadcrumbs, nested subcategories | Draw | Draw |
| Resident | All category routes | Search/filter panel, active filter chips, price/rating/verified fields, clear | Draw | Draw |
| Resident | All category routes | Product/service cards, business cards, pagination | Draw | Draw |
| Resident | All category routes | Category not found, load error, no listings, retry | Draw | Draw |
| Resident | `/business/:slug` or listing modal | Listing detail modal/page | Draw | Draw |
| Resident | Listing detail | Loading, unavailable, hidden/owner-private, public address hidden | Draw | Draw |
| Resident | Listing detail | Call/WhatsApp, event failure, no valid phone | Draw | Draw |
| Resident | Listing detail | Save, saved state, guest login prompt, save error | Draw | Draw |
| Resident | Listing detail | Reviews list, empty, 1–5 rating, submit, duplicate, invalid, success | Draw | Draw |
| Resident | Listing detail | Report action, report popup, submitted/error (proposed) | Proposed | Proposed |
| Resident | Login dialog | OTP number/consent form | Draw | Draw |
| Resident | Login dialog | Consent unchecked and pending states | Draw | Draw |
| Resident | Login dialog | Invalid mobile, resend/rate limit, delivery/configuration errors | Draw | Draw |
| Resident | Login dialog | Code entry, wrong/expired/max attempts, resend countdown, change number | Draw | Draw |
| Resident | Login dialog | Password mode and login failure | Draw | Draw |
| Resident | Login dialog | Success/return to original action | Draw | Draw |
| Resident | Header | Logged out/logged in/super-admin navigation, logout error | Draw | Draw |
| Resident | Saved (not built) | Saved list and empty state | Proposed | Proposed |
| Resident | Society/preferences (not built) | Society chooser, category preferences, notification settings | Proposed | Proposed |
| Owner | `/mysobo/owner` | Guest sign-in gate | Draw | Draw |
| Owner | `/mysobo/owner` | Overview: owned listing rows/loading/empty/verified/under review | Draw | Draw |
| Owner | `/mysobo/owner` | Edit listing disclosure, dynamic fields, validation/error/save success | Draw | Draw |
| Owner | `/mysobo/owner` | Claim search, no search, no results, duplicate pending/already member | Draw | Draw |
| Owner | `/mysobo/owner` | Create listing form, required/dynamic fields, success/error | Draw | Draw |
| Owner | `/mysobo/owner` | Offer form, pending status, no listing, submit success/error | Draw | Draw |
| Owner | `/mysobo/owner` | Plan choice, active plan prices, pending request, duplicate request | Draw | Draw |
| Owner | `/mysobo/owner` | Free/Pro/Premium comparison (proposed) | Proposed | Proposed |
| Owner | `/mysobo/owner` | Trial/active/grace/expired/lapse/renewal (proposed) | Proposed | Proposed |
| Owner | `/mysobo/owner` | Profile completeness, insights, inbox, team invites (proposed) | Proposed | Proposed |
| Super-admin | `/mysobo/superadmin` | Sign-in gate and regular-user access restricted | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | Dashboard metrics cards | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | Verification queue, verify/reject, audit, success/error | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | Claims queue, approve/reject, optional/proposed note | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | Plan request queue, approve/reject, trial/plan result | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | Plan pricing form, active status, validation, success | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | Payment form, paise/GST conversion, recent payments | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | Category add/edit/deactivate, search/loading/error | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | Subcategory add/edit/deactivate/nested parent | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | Category field add/edit/deactivate | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | Field-agent entry form, hidden awaiting verification | Draw | Draw |
| Super-admin | `/mysobo/superadmin` | CSV import upload, limits, row errors, all-or-nothing result | Draw | Draw |
| Super-admin | Admin proposed | Offer moderation queue | Proposed | Proposed |
| Super-admin | Admin proposed | Abuse/report queue, resolution, hide/dismiss | Proposed | Proposed |
| Super-admin | Admin proposed | Document/evidence review and verification progress | Proposed | Proposed |
| Super-admin | Admin proposed | Queue filters, bulk confirm, SLA timers | Proposed | Proposed |
| Super-admin | Admin proposed | Audit log, staff role management, revenue reports, duplicate merge | Proposed | Proposed |
