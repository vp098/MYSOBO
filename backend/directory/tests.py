import io
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from accounts.models import AdminRole, Profile, User
from billing.models import Invoice, Payment
from .models import (
    BusinessPost,
    Business,
    BusinessMember,
    BusinessProduct,
    BusinessService,
    Category,
    Claim,
    Event,
    Review,
    Subcategory,
)


class BusinessAuthorizationTests(TestCase):
    def setUp(self):
        self.owner_a = User.objects.create_user(username="owner-a", password="test")
        self.owner_b = User.objects.create_user(username="owner-b", password="test")
        Profile.objects.create(id=self.owner_a, mobile="7000000001")
        Profile.objects.create(id=self.owner_b, mobile="7000000002")
        self.category = Category.objects.create(name="Medical", slug="medical")
        self.business_a = Business.objects.create(
            name="Clinic A", slug="clinic-a", kind="service",
            category=self.category, address="Secret Lane", hide_address=True,
            source="owner",
        )
        self.business_b = Business.objects.create(
            name="Clinic B", slug="clinic-b", kind="service",
            category=self.category, address="Other Lane", source="owner",
        )
        BusinessMember.objects.create(user=self.owner_a, business=self.business_a, role="owner")
        self.client = APIClient()

    def test_hidden_address_is_removed_for_public_user(self):
        response = self.client.get(f"/api/businesses/{self.business_a.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["address"])

    def test_public_business_response_hides_internal_fields(self):
        response = self.client.get(f"/api/businesses/{self.business_b.id}/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["verified"] is False)
        for field in (
            "verification_level",
            "source",
            "hidden",
            "plan",
            "plan_expires_on",
            "deleted_at",
            "amount_paise",
            "monthly_price",
        ):
            self.assertNotIn(field, payload)

    def test_public_contact_action_is_saved_as_an_event(self):
        response = self.client.post(
            f"/api/businesses/{self.business_b.id}/events/",
            {"type": "call"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {"status": "recorded"})
        self.assertTrue(
            Event.objects.filter(
                business=self.business_b,
                user__isnull=True,
                type="call",
            ).exists()
        )

        invalid = self.client.post(
            f"/api/businesses/{self.business_b.id}/events/",
            {"type": "payment"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)

    def test_owner_cannot_edit_another_business(self):
        self.client.force_authenticate(self.owner_a)
        response = self.client.patch(
            f"/api/businesses/{self.business_b.id}/",
            {"name": "Changed"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_owner_can_edit_owned_business(self):
        self.client.force_authenticate(self.owner_a)
        response = self.client.patch(
            f"/api/businesses/{self.business_a.id}/",
            {"description": "Updated"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_category_and_kind_filters_are_applied(self):
        product = Business.objects.create(
            name="Product Shop", slug="product-shop", kind="product",
            category=self.category, source="seed",
        )
        both = Business.objects.create(
            name="Shop and Clinic", slug="shop-and-clinic", kind="both",
            category=self.category, source="seed",
        )
        response = self.client.get("/api/businesses/?category=medical&kind=service")
        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        self.assertEqual(
            {item["name"] for item in results},
            {"Clinic B", "Clinic A", "Shop and Clinic"},
        )

        product_response = self.client.get("/api/businesses/?kind=product")
        self.assertEqual(product_response.status_code, 200)
        self.assertEqual(
            {item["id"] for item in product_response.json()["results"]},
            {str(product.id), str(both.id)},
        )
        category_product_response = self.client.get(
            "/api/businesses/?category=medical&kind=product"
        )
        self.assertEqual(category_product_response.status_code, 200)
        self.assertEqual(
            {item["id"] for item in category_product_response.json()["results"]},
            {str(product.id), str(both.id)},
        )

        all_response = self.client.get("/api/businesses/?kind=all")
        self.assertEqual(all_response.status_code, 200)
        self.assertEqual(
            {item["id"] for item in all_response.json()["results"]},
            {str(self.business_a.id), str(self.business_b.id), str(product.id), str(both.id)},
        )

    def test_categories_are_filtered_for_selected_listing_kind(self):
        service_category = Category.objects.create(
            name="Tuition", slug="tuition",
            supports_services=True, supports_products=False,
        )
        product_category = Category.objects.create(
            name="Shopping", slug="shopping",
            supports_services=False, supports_products=True,
        )
        both_category = Category.objects.create(
            name="Market", slug="market",
            supports_services=True, supports_products=True,
        )
        service_subcategory = Subcategory.objects.create(
            category=service_category,
            name="Home tutor",
            slug="home-tutor",
            supports_services=True,
            supports_products=False,
        )
        product_subcategory = Subcategory.objects.create(
            category=both_category,
            name="Gift shop",
            slug="gift-shop",
            supports_services=False,
            supports_products=True,
        )
        product_service_subcategory = Subcategory.objects.create(
            category=both_category,
            name="Repair and sales",
            slug="repair-and-sales",
            supports_services=True,
            supports_products=True,
        )

        services = self.client.get("/api/categories/?kind=service")
        service_categories = {item["slug"]: item for item in services.json()}
        service_slugs = set(service_categories)
        self.assertIn(service_category.slug, service_slugs)
        self.assertIn(both_category.slug, service_slugs)
        self.assertNotIn(product_category.slug, service_slugs)
        market_service_subcategories = {
            item["slug"] for item in service_categories[both_category.slug]["subcategories"]
        }
        self.assertIn(product_service_subcategory.slug, market_service_subcategories)
        self.assertNotIn(product_subcategory.slug, market_service_subcategories)

        products = self.client.get("/api/categories/?kind=product")
        product_categories = {item["slug"]: item for item in products.json()}
        product_slugs = set(product_categories)
        self.assertIn(product_category.slug, product_slugs)
        self.assertIn(both_category.slug, product_slugs)
        self.assertNotIn(service_category.slug, product_slugs)
        market_product_subcategories = {
            item["slug"] for item in product_categories[both_category.slug]["subcategories"]
        }
        self.assertIn(product_subcategory.slug, market_product_subcategories)
        self.assertNotIn(service_subcategory.slug, market_product_subcategories)

    def test_subcategory_filter_matches_selected_subcategory(self):
        subcategory = Subcategory.objects.create(
            category=self.category, name="Dentist", slug="dentist",
            supports_services=True, supports_products=False,
        )
        self.business_a.subcategory = subcategory
        self.business_a.save(update_fields=("subcategory",))
        response = self.client.get(
            "/api/businesses/?kind=service&category=medical&subcategory=dentist"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.json()["results"]],
            [str(self.business_a.id)],
        )

    def test_search_matches_product_and_service_catalog_entries(self):
        product_business = Business.objects.create(
            name="Local Apparel",
            slug="local-apparel",
            kind=Business.Kind.PRODUCT,
            category=self.category,
            source="seed",
        )
        service_business = Business.objects.create(
            name="Tailor Shop",
            slug="tailor-shop",
            kind=Business.Kind.SERVICE,
            category=self.category,
            source="seed",
        )
        BusinessProduct.objects.create(
            business=product_business,
            category=self.category,
            name="Linen shirt",
            brand="South Cotton",
        )
        BusinessService.objects.create(
            business=service_business,
            category=self.category,
            name="Linen alterations",
        )
        response = self.client.get("/api/businesses/?q=linen")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {item["id"] for item in response.data["results"]},
            {str(product_business.id), str(service_business.id)},
        )

    def test_listing_detail_opens_by_slug_and_id(self):
        by_slug = self.client.get(f"/api/businesses/{self.business_b.slug}/")
        by_id = self.client.get(f"/api/businesses/{self.business_b.id}/")
        self.assertEqual(by_slug.status_code, 200)
        self.assertEqual(by_id.status_code, 200)
        self.assertEqual(by_slug.json()["id"], str(self.business_b.id))
        self.assertEqual(by_id.json()["slug"], self.business_b.slug)

    def test_resident_can_save_and_review_after_login(self):
        self.client.force_authenticate(self.owner_b)
        business_url = f"/api/businesses/{self.business_b.id}"
        saved = self.client.post(f"{business_url}/saved/", {}, format="json")
        self.assertEqual(saved.status_code, 200)
        self.assertTrue(saved.json()["saved"])
        removed = self.client.delete(f"{business_url}/saved/")
        self.assertEqual(removed.status_code, 200)
        self.assertFalse(removed.json()["saved"])

        review = self.client.post(
            f"{business_url}/reviews/",
            {"rating": 5, "body": "Helpful service"},
            format="json",
        )
        self.assertEqual(review.status_code, 201)
        self.assertEqual(Review.objects.get().rating, 5)
        duplicate = self.client.post(
            f"{business_url}/reviews/",
            {"rating": 4, "body": "A second review"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 409)
        invalid = self.client.post(
            f"{business_url}/reviews/",
            {"rating": 6, "body": "Invalid rating"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)

    def test_token_login_current_user_and_logout(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "owner-a", "password": "test"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        token = response.json()["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)

    def test_owner_portal_only_returns_member_listings(self):
        self.client.force_authenticate(self.owner_a)
        response = self.client.get("/api/owner/businesses/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.json()], [str(self.business_a.id)])

    def test_owner_can_find_and_claim_unpublished_listing(self):
        self.business_b.hidden = True
        self.business_b.save(update_fields=("hidden",))
        self.client.force_authenticate(self.owner_b)
        candidates = self.client.get("/api/owner/claimable/?q=Clinic")
        self.assertEqual(candidates.status_code, 200)
        self.assertIn(str(self.business_b.id), [item["id"] for item in candidates.json()])
        response = self.client.post(
            "/api/owner/claims/",
            {"business_id": str(self.business_b.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "pending")

    def test_superadmin_can_approve_claim_and_verify_listing(self):
        admin = User.objects.create_user(username="admin", password="test")
        AdminRole.objects.create(user=admin, role=AdminRole.Role.SUPER_ADMIN)
        claim = Claim.objects.create(business=self.business_b, user=self.owner_b)
        self.client.force_authenticate(admin)
        response = self.client.post(
            "/api/admin/claims/",
            {"claim_id": str(claim.id), "decision": "approved"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.business_b.members.filter(user=self.owner_b).exists())
        verify = self.client.post(
            f"/api/admin/businesses/{self.business_b.id}/verify/",
            {"decision": "verify"},
            format="json",
        )
        self.assertEqual(verify.status_code, 200)
        self.business_b.refresh_from_db()
        self.assertEqual(self.business_b.verification_level, 2)

    def test_admin_portal_is_not_available_to_regular_users(self):
        self.client.force_authenticate(self.owner_a)
        response = self.client.get("/api/admin/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_owner_created_listing_is_private_until_verification(self):
        self.client.force_authenticate(self.owner_a)
        response = self.client.post(
            "/api/businesses/",
            {
                "name": "New Home Service",
                "slug": "new-home-service",
                "kind": "service",
                "category_id": str(self.category.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        listing_id = response.json()["id"]
        listing = Business.objects.get(id=listing_id)
        self.assertTrue(listing.hidden)
        self.assertTrue(listing.members.filter(user=self.owner_a).exists())
        public_response = APIClient().get("/api/businesses/")
        public_ids = {row["id"] for row in public_response.json()["results"]}
        self.assertNotIn(listing_id, public_ids)

    def test_superadmin_records_payment_and_creates_invoice(self):
        admin = User.objects.create_user(username="billing-admin", password="test")
        AdminRole.objects.create(user=admin, role=AdminRole.Role.SUPER_ADMIN)
        self.client.force_authenticate(admin)
        response = self.client.post(
            "/api/admin/payments/",
            {
                "business_id": str(self.business_b.id),
                "plan": "pro",
                "amount_paise": 49900,
                "gst_paise": 8982,
                "method": "cash",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(Invoice.objects.count(), 1)
        self.business_b.refresh_from_db()
        self.assertEqual(self.business_b.plan, "pro")


class CategoryManagementTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="category-admin", password="test")
        AdminRole.objects.create(user=self.admin, role=AdminRole.Role.SUPER_ADMIN)
        self.client = APIClient()

    def test_category_management_requires_superadmin(self):
        resident = User.objects.create_user(username="category-resident", password="test")
        self.client.force_authenticate(resident)
        response = self.client.post(
            "/api/admin/categories/",
            {"name": "New product category", "supports_products": True},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_superadmin_csv_import_validates_all_rows_before_creating(self):
        category = Category.objects.create(
            name="Clothing",
            slug="clothing",
            supports_services=False,
            supports_products=True,
        )
        self.client.force_authenticate(self.admin)
        valid_csv = SimpleUploadedFile(
            "businesses.csv",
            b"name,kind,category_slug,phone\nLocal Clothing,product,clothing,9876543210\n",
            content_type="text/csv",
        )
        response = self.client.post(
            "/api/admin/businesses/import/",
            {"file": valid_csv},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.data)
        imported = Business.objects.get(slug="local-clothing")
        self.assertTrue(imported.hidden)
        self.assertEqual(imported.source, "field_agent")
        self.assertEqual(imported.verification_level, 1)

        invalid_csv = SimpleUploadedFile(
            "invalid.csv",
            b"name,kind,category_slug\nShould not save,product,missing-category\n",
            content_type="text/csv",
        )
        rejected = self.client.post(
            "/api/admin/businesses/import/",
            {"file": invalid_csv},
            format="multipart",
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(Business.objects.filter(name="Should not save").count(), 0)

    def test_category_counts_follow_active_listings_and_selected_type(self):
        category = Category.objects.create(
            name="Local market",
            slug="local-market",
            supports_services=True,
            supports_products=True,
        )
        for name, kind in (
            ("Market service", Business.Kind.SERVICE),
            ("Market product", Business.Kind.PRODUCT),
            ("Market both", Business.Kind.BOTH),
        ):
            Business.objects.create(
                name=name,
                slug=name.lower().replace(" ", "-"),
                kind=kind,
                category=category,
                source="seed",
            )
        Business.objects.create(
            name="Hidden listing",
            slug="hidden-market-listing",
            kind=Business.Kind.BOTH,
            category=category,
            hidden=True,
            source="seed",
        )

        counts = {}
        for kind in ("all", "service", "product"):
            response = self.client.get(f"/api/categories/?kind={kind}")
            self.assertEqual(response.status_code, 200)
            item = next(row for row in response.data if row["id"] == str(category.id))
            counts[kind] = item["listing_count"]

        self.assertEqual(counts, {"all": 3, "service": 2, "product": 2})

    def test_superadmin_can_create_hierarchical_product_categories(self):
        self.client.force_authenticate(self.admin)
        category_response = self.client.post(
            "/api/admin/categories/",
            {
                "name": "Electronics",
                "supports_services": False,
                "supports_products": True,
            },
            format="json",
        )
        self.assertEqual(category_response.status_code, 201, category_response.data)
        category_id = category_response.data["id"]

        parent_response = self.client.post(
            "/api/admin/subcategories/",
            {
                "category_id": category_id,
                "name": "Mobile Phones",
                "supports_services": False,
                "supports_products": True,
            },
            format="json",
        )
        self.assertEqual(parent_response.status_code, 201, parent_response.data)
        child_response = self.client.post(
            "/api/admin/subcategories/",
            {
                "category_id": category_id,
                "parent_id": parent_response.data["id"],
                "name": "Smartphones",
                "supports_services": False,
                "supports_products": True,
            },
            format="json",
        )
        self.assertEqual(child_response.status_code, 201, child_response.data)

        nested_service = self.client.post(
            "/api/admin/subcategories/",
            {
                "category_id": category_id,
                "parent_id": parent_response.data["id"],
                "name": "Phone repair",
                "supports_services": True,
                "supports_products": False,
            },
            format="json",
        )
        self.assertEqual(nested_service.status_code, 400)

        Business.objects.create(
            name="Electronics Store",
            slug="electronics-store",
            kind=Business.Kind.PRODUCT,
            category_id=category_id,
            subcategory_id=child_response.data["id"],
            source="seed",
        )
        Business.objects.create(
            name="Hidden Product",
            slug="hidden-product",
            kind=Business.Kind.PRODUCT,
            category_id=category_id,
            hidden=True,
            source="seed",
        )
        Business.objects.create(
            name="Removed Electronics Store",
            slug="removed-electronics-store",
            kind=Business.Kind.PRODUCT,
            category_id=category_id,
            subcategory_id=child_response.data["id"],
            source="seed",
            deleted_at=timezone.now(),
        )

        product_categories = self.client.get("/api/categories/?kind=product")
        self.assertEqual(product_categories.status_code, 200)
        electronics = next(
            item for item in product_categories.data if item["id"] == category_id
        )
        self.assertEqual(electronics["listing_count"], 1)
        levels = {item["name"]: item for item in electronics["subcategories"]}
        self.assertEqual(levels["Smartphones"]["parent_id"], parent_response.data["id"])
        self.assertEqual(levels["Smartphones"]["listing_count"], 1)

        deleted = self.client.delete(f"/api/admin/categories/{category_id}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertNotIn(
            category_id,
            {item["id"] for item in self.client.get("/api/categories/").data},
        )
        self.assertFalse(Category.objects.get(id=category_id).active)


class ListingApprovalRequestTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="approval-owner", password="test")
        self.stranger = User.objects.create_user(username="approval-stranger", password="test")
        self.admin = User.objects.create_user(username="approval-admin", password="test")
        AdminRole.objects.create(user=self.admin, role=AdminRole.Role.SUPER_ADMIN)
        self.business = Business.objects.create(
            name="Draft Shop", slug="draft-shop", kind="service", source="owner", hidden=True,
        )
        BusinessMember.objects.create(user=self.owner, business=self.business, role="owner")
        self.client = APIClient()
        self.url = f"/api/owner/businesses/{self.business.id}/request-approval/"

    def test_owner_can_request_approval_once(self):
        self.client.force_authenticate(self.owner)
        first = self.client.post(self.url)
        self.assertEqual(first.status_code, 200)
        self.business.refresh_from_db()
        requested_at = self.business.approval_requested_at
        self.assertIsNotNone(requested_at)
        second = self.client.post(self.url)
        self.assertEqual(second.status_code, 200)
        self.business.refresh_from_db()
        self.assertEqual(self.business.approval_requested_at, requested_at)

    def test_non_member_cannot_request_approval(self):
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.post(self.url).status_code, 404)
        self.business.refresh_from_db()
        self.assertIsNone(self.business.approval_requested_at)

    def test_live_listing_cannot_request_approval(self):
        self.business.hidden = False
        self.business.save()
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(self.url).status_code, 409)

    def test_admin_approval_publishes_and_clears_request(self):
        self.business.approval_requested_at = timezone.now()
        self.business.save()
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/admin/businesses/{self.business.id}/verify/", {"decision": "verify"})
        self.assertEqual(response.status_code, 200)
        self.business.refresh_from_db()
        self.assertFalse(self.business.hidden)
        self.assertIsNone(self.business.approval_requested_at)

    def test_owner_list_includes_request_state_and_note(self):
        self.business.verification_note = "Add your shop address."
        self.business.save()
        self.client.force_authenticate(self.owner)
        data = self.client.get("/api/owner/businesses/").json()
        self.assertEqual(data[0]["review_note"], "Add your shop address.")
        self.assertIn("approval_requested_at", data[0])

    def test_review_note_is_not_public(self):
        self.business.hidden = False
        self.business.verification_note = "Internal note"
        self.business.save()
        data = self.client.get(f"/api/businesses/{self.business.slug}/").json()
        self.assertNotIn("review_note", data)
        self.assertNotIn("verification_note", data)


class SavedBusinessesListTests(TestCase):
    def test_lists_only_my_visible_saved_businesses(self):
        from .models import SavedBusiness
        me = User.objects.create_user(username="saver", password="test")
        other = User.objects.create_user(username="other-saver", password="test")
        shown = Business.objects.create(name="Shown", slug="shown", kind="service", source="owner")
        hidden = Business.objects.create(name="Hidden", slug="hidden-one", kind="service", source="owner", hidden=True)
        theirs = Business.objects.create(name="Theirs", slug="theirs", kind="service", source="owner")
        SavedBusiness.objects.create(user=me, business=shown)
        SavedBusiness.objects.create(user=me, business=hidden)
        SavedBusiness.objects.create(user=other, business=theirs)
        client = APIClient()
        self.assertEqual(client.get("/api/me/saved/").status_code, 401)
        client.force_authenticate(me)
        names = [item["name"] for item in client.get("/api/me/saved/").json()]
        self.assertEqual(names, ["Shown"])


class SampleDataCommandTests(TestCase):
    def test_seed_and_remove_sample_data(self):
        from django.core.management import call_command
        call_command("seed_dashboard_demo", owner_mobile="9876500000", stdout=io.StringIO())
        public = Business.objects.filter(source="sample", hidden=False)
        self.assertGreaterEqual(public.count(), 16)
        self.assertFalse(public.exclude(phone__startswith="00000").exists())
        sample = public.get(slug="sample-safal-parisar-sparkle-home-care")
        self.assertEqual(sample.services.count(), 3)
        self.assertEqual(sample.hours.count(), 7)
        owner = User.objects.get(mobile="9876500000")
        self.assertEqual(Business.objects.filter(members__user=owner).count(), 4)
        call_command("seed_dashboard_demo", owner_mobile="9876500000", stdout=io.StringIO())
        self.assertEqual(Business.objects.filter(members__user=owner).count(), 4)
        call_command("seed_dashboard_demo", remove=True, stdout=io.StringIO())
        self.assertFalse(Business.objects.filter(source="sample").exists())
        self.assertTrue(User.objects.filter(mobile="9876500000").exists())

    def test_seed_for_google_email_owner(self):
        from django.core.management import call_command
        call_command("seed_dashboard_demo", owner_email="Owner@Gmail.com", stdout=io.StringIO())
        owner = User.objects.get(email="owner@gmail.com")
        states = sorted(
            "live" if not b.hidden else ("waiting" if b.approval_requested_at else "draft")
            for b in Business.objects.filter(members__user=owner)
        )
        self.assertEqual(states, ["draft", "live", "live", "waiting"])


class ContactDetailsNeedSignInTests(TestCase):
    def setUp(self):
        self.business = Business.objects.create(
            name="Phone Shop", slug="phone-shop", kind="service", source="owner",
            phone="9876543210", whatsapp="9876543210", email="shop@example.com",
        )
        self.client = APIClient()

    def test_guest_sees_masked_number_only(self):
        data = self.client.get("/api/businesses/phone-shop/").json()
        self.assertEqual(data["phone"], "")
        self.assertEqual(data["whatsapp"], "")
        self.assertEqual(data["email"], "")
        self.assertEqual(data["phone_masked"], "XXXXX XXX10")
        self.assertTrue(data["contact_locked"])
        listing = self.client.get("/api/businesses/").json()
        rows = listing["results"] if isinstance(listing, dict) else listing
        self.assertTrue(all(row["phone"] == "" for row in rows))

    def test_signed_in_resident_sees_real_number(self):
        resident = User.objects.create_user(username="reader", password="x")
        self.client.force_authenticate(resident)
        data = self.client.get("/api/businesses/phone-shop/").json()
        self.assertEqual(data["phone"], "9876543210")
        self.assertFalse(data["contact_locked"])

    def test_guest_cannot_search_by_phone(self):
        listing = self.client.get("/api/businesses/?q=98765").json()
        rows = listing["results"] if isinstance(listing, dict) else listing
        self.assertEqual(rows, [])
        self.client.force_authenticate(User.objects.create_user(username="finder", password="x"))
        listing = self.client.get("/api/businesses/?q=98765").json()
        rows = listing["results"] if isinstance(listing, dict) else listing
        self.assertEqual([row["name"] for row in rows], ["Phone Shop"])

    def test_guest_cannot_post_review(self):
        response = self.client.post("/api/businesses/phone-shop/reviews/", {"rating": 5, "body": "Nice"}, format="json")
        self.assertIn(response.status_code, (401, 403))


class ReviewNamePrivacyTests(TestCase):
    def test_review_never_shows_username_or_mobile(self):
        business = Business.objects.create(name="Cafe", slug="cafe", kind="service", source="owner")
        otp_user = User.objects.create_user(username="resident-9876543210-ab12cd34", mobile="9876543210")
        named = User.objects.create_user(username="google-1", first_name="Hetal", last_name="Shah")
        Review.objects.create(business=business, user=otp_user, rating=5, body="Good")
        Review.objects.create(business=business, user=named, rating=4, body="Nice")
        names = sorted(row["user_name"] for row in APIClient().get("/api/businesses/cafe/reviews/").json())
        self.assertEqual(names, ["Hetal S.", "Resident"])



class AdminOperationsTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username="ops-admin", password="x", first_name="Ops")
        AdminRole.objects.create(user=self.admin, role=AdminRole.Role.SUPER_ADMIN)
        self.owner = User.objects.create_user(username="shop-owner", password="x", first_name="Ravi", last_name="Patel")
        self.business = Business.objects.create(name="Patel Clinic", slug="patel-clinic", kind="service", source="field_agent", hidden=True)
        self.client = APIClient()

    def test_non_admin_is_refused(self):
        self.client.force_authenticate(self.owner)
        for url in ("/api/admin/posts/", "/api/admin/reports/", "/api/admin/audit/", "/api/admin/settings/"):
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_accepting_listing_request_grants_access_and_verifies(self):
        claim = Claim.objects.create(business=self.business, user=self.owner)
        self.client.force_authenticate(self.admin)
        queue = self.client.get("/api/admin/claims/").json()
        self.assertEqual(queue[0]["user"], "Ravi Patel")
        self.assertNotIn("shop-owner", str(queue))
        response = self.client.post("/api/admin/claims/", {"claim_id": str(claim.id), "decision": "approved"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.business.refresh_from_db()
        self.assertEqual(self.business.verification_level, 2)
        self.assertFalse(self.business.hidden)
        self.assertTrue(BusinessMember.objects.filter(user=self.owner, business=self.business).exists())
        audit = self.client.get("/api/admin/audit/").json()
        self.assertEqual(audit[0]["action"], "listing_request_approved")

    def test_offer_moderation(self):
        from .models import BusinessPost
        post = BusinessPost.objects.create(business=self.business, title="10% off", status="pending")
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/admin/posts/").json()[0]["title"], "10% off")
        response = self.client.post("/api/admin/posts/", {"post_id": str(post.id), "decision": "approved"}, format="json")
        self.assertEqual(response.status_code, 200)
        post.refresh_from_db()
        self.assertEqual(post.status, "approved")
        bad = self.client.post("/api/admin/posts/", {"post_id": str(post.id), "decision": "maybe"}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_reports_resolve(self):
        from .models import Report
        report = Report.objects.create(business=self.business, reporter=self.owner, reason="Phone number changed")
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/admin/reports/").json()[0]["reason"], "Phone number changed")
        self.client.post("/api/admin/reports/", {"report_id": str(report.id)}, format="json")
        report.refresh_from_db()
        self.assertEqual(report.status, "resolved")

    def test_settings_defaults_and_update(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get("/api/admin/settings/").json(), {"grace_period_days": 7, "free_pro_cap": 100, "approval_sla_hours": 48})
        updated = self.client.put("/api/admin/settings/", {"approval_sla_hours": 24}, format="json").json()
        self.assertEqual(updated["approval_sla_hours"], 24)
        self.assertEqual(self.client.put("/api/admin/settings/", {"free_pro_cap": "lots"}, format="json").status_code, 400)

    def test_dashboard_counts_pending_approvals(self):
        self.business.approval_requested_at = timezone.now()
        self.business.save()
        self.client.force_authenticate(self.admin)
        data = self.client.get("/api/admin/dashboard/").json()
        self.assertEqual(data["pending_approvals"], 1)
        self.assertIn("revenue_paise", data)


class OwnerListingFlowTests(TestCase):
    def test_new_listing_is_requested_and_stats_count_events(self):
        owner = User.objects.create_user(username="new-owner", password="x")
        category = Category.objects.create(name="Food", slug="food")
        client = APIClient()
        client.force_authenticate(owner)
        response = client.post("/api/businesses/", {"name": "Tiffin Ghar", "slug": "tiffin-ghar", "kind": "service", "category_id": str(category.id)}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        business = Business.objects.get(slug="tiffin-ghar")
        self.assertTrue(business.hidden)
        self.assertIsNotNone(business.approval_requested_at)
        business.hidden = False
        business.save()
        guest = APIClient()
        for kind in ("view", "view", "call", "whatsapp"):
            self.assertEqual(guest.post("/api/businesses/tiffin-ghar/events/", {"type": kind}, format="json").status_code, 201)
        stats = client.get("/api/owner/stats/").json()
        self.assertEqual(stats["view"], 2)
        self.assertEqual(stats["call"], 1)
        self.assertEqual(stats["whatsapp"], 1)



class OwnerToolsTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="tools-owner", password="x")
        self.other = User.objects.create_user(username="tools-other", password="x")
        self.business = Business.objects.create(name="Tools Shop", slug="tools-shop", kind="service", source="owner")
        BusinessMember.objects.create(user=self.owner, business=self.business, role="owner")
        self.client = APIClient()

    def test_hours_replace_and_validate(self):
        url = f"/api/owner/businesses/{self.business.id}/hours/"
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.put(url, {"hours": []}, format="json").status_code, 404)
        self.client.force_authenticate(self.owner)
        ok = self.client.put(url, {"hours": [{"dow": 0, "opens": "09:00", "closes": "18:00"}, {"dow": 6, "closed": True}]}, format="json")
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(self.business.hours.count(), 2)
        bad = self.client.put(url, {"hours": [{"dow": 1, "opens": "18:00", "closes": "09:00"}]}, format="json")
        self.assertEqual(bad.status_code, 400)
        public = APIClient().get("/api/businesses/tools-shop/").json()
        self.assertEqual(len(public["hours"]), 2)

    def test_offer_expiry_and_public_offers(self):
        from datetime import timedelta
        from .models import BusinessPost
        today = timezone.localdate()
        BusinessPost.objects.create(business=self.business, title="Live", status="approved", expires_on=today + timedelta(days=3))
        BusinessPost.objects.create(business=self.business, title="Expired", status="approved", expires_on=today - timedelta(days=1))
        BusinessPost.objects.create(business=self.business, title="Pending", status="pending")
        BusinessPost.objects.create(business=self.business, title="Later", status="approved", starts_on=today + timedelta(days=2))
        titles = [row["title"] for row in APIClient().get("/api/businesses/tools-shop/offers/").json()]
        self.assertEqual(titles, ["Live"])
        self.business.plan = "pro"  # Free allows one active offer; this listing already has more
        self.business.save()
        self.client.force_authenticate(self.owner)
        created = self.client.post("/api/owner/posts/", {"business_id": str(self.business.id), "title": "New", "body": "x", "expires_on": str(today)}, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(created.json()["expires_on"], str(today))

    def test_preferences_and_invoices(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get("/api/me/preferences/").json()["whatsapp_alerts"], True)
        self.assertEqual(self.client.patch("/api/me/preferences/", {"whatsapp_alerts": False}, format="json").json()["whatsapp_alerts"], False)
        self.assertEqual(self.client.patch("/api/me/preferences/", {"theme": "neon"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch("/api/me/preferences/", {"whatsapp_alerts": "no"}, format="json").status_code, 400)
        self.assertEqual(self.client.get("/api/owner/invoices/").json(), [])
        admin = User.objects.create_user(username="inv-admin", password="x")
        AdminRole.objects.create(user=admin, role=AdminRole.Role.SUPER_ADMIN)
        staff = APIClient()
        staff.force_authenticate(admin)
        staff.post("/api/admin/payments/", {"business_id": str(self.business.id), "plan": "pro", "amount_paise": 49900, "method": "upi"}, format="json")
        rows = self.client.get("/api/owner/invoices/").json()
        self.assertEqual(rows[0]["business"], "Tools Shop")
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/owner/invoices/").json(), [])



class ResilienceTests(TestCase):
    def test_health_endpoint(self):
        response = APIClient().get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "database": "ok"})

    def test_handler_turns_database_errors_into_json(self):
        from django.db import DatabaseError, IntegrityError, OperationalError
        from mysobo.exceptions import api_exception_handler
        cases = [
            (IntegrityError("duplicate key"), 409, "conflict"),
            (OperationalError("canceling statement due to statement timeout"), 503, "timeout"),
            (DatabaseError("server closed the connection"), 503, "unavailable"),
            (RuntimeError("boom"), 500, "server_error"),
        ]
        for exc, code, slug in cases:
            response = api_exception_handler(exc, {"view": None})
            self.assertEqual(response.status_code, code)
            self.assertEqual(response.data["code"], slug)
            self.assertNotIn("duplicate key", str(response.data))
            self.assertNotIn("boom", str(response.data))

    def test_validation_errors_have_readable_detail(self):
        owner = User.objects.create_user(username="val-owner", password="x")
        client = APIClient()
        client.force_authenticate(owner)
        response = client.post("/api/businesses/", {"kind": "service"}, format="json")
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "invalid")
        self.assertIn("This field is required", body["detail"])
        self.assertIn(":", body["detail"])  # names the field, e.g. "slug: ..."
        self.assertIn("name", body)  # field errors are still there for forms

    def test_business_list_query_count_does_not_grow(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        user = User.objects.create_user(username="counter", password="x")
        client = APIClient()
        client.force_authenticate(user)
        category = Category.objects.create(name="Count", slug="count")

        def count_for(n):
            for i in range(n):
                Business.objects.create(name=f"B{n}-{i}", slug=f"b{n}-{i}", kind="service", source="owner", category=category)
            with CaptureQueriesContext(connection) as ctx:
                self.assertEqual(client.get("/api/businesses/").status_code, 200)
            return len(ctx.captured_queries)

        few = count_for(2)
        many = count_for(6)
        self.assertEqual(few, many)

    def test_duplicate_payment_reference_is_a_clean_conflict(self):
        admin = User.objects.create_user(username="pay-admin", password="x")
        AdminRole.objects.create(user=admin, role=AdminRole.Role.SUPER_ADMIN)
        business = Business.objects.create(name="Payer", slug="payer", kind="service", source="owner")
        client = APIClient()
        client.force_authenticate(admin)
        body = {"business_id": str(business.id), "plan": "pro", "amount_paise": 49900, "method": "upi", "gateway_ref": "UPI-123"}
        self.assertEqual(client.post("/api/admin/payments/", body, format="json").status_code, 201)
        second = client.post("/api/admin/payments/", body, format="json")
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.json()["code"], "conflict")
        from billing.models import Subscription
        self.assertEqual(Subscription.objects.filter(business=business).count(), 1)

    def test_one_pending_listing_request_per_person_is_enforced_by_the_database(self):
        from django.db import IntegrityError, transaction
        user = User.objects.create_user(username="dup-req", password="x")
        business = Business.objects.create(name="Dup", slug="dup", kind="service", source="owner")
        Claim.objects.create(business=business, user=user)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Claim.objects.create(business=business, user=user)
        Claim.objects.filter(user=user).update(status="rejected")
        Claim.objects.create(business=business, user=user)  # allowed again after a decision


import shutil
import tempfile

from django.test import override_settings

from .models import BusinessPhoto

_PHOTO_MEDIA = tempfile.mkdtemp(prefix="mysobo-photos-")


def _image_file(name="shop.jpg", fmt="JPEG", size=(64, 48), exif_gps=False):
    from PIL import Image
    buffer = io.BytesIO()
    image = Image.new("RGB", size, (40, 122, 75))
    kwargs = {}
    if exif_gps:
        exif = Image.Exif()
        exif[0x8825] = {1: "N", 2: (23.0, 1.0, 0.0)}  # GPS info
        kwargs["exif"] = exif
    image.save(buffer, fmt, **kwargs)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=f"image/{fmt.lower()}")


@override_settings(MEDIA_ROOT=_PHOTO_MEDIA)
class OwnerPhotoTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_PHOTO_MEDIA, ignore_errors=True)

    def setUp(self):
        self.owner = User.objects.create_user(username="photo-owner", password="x")
        self.other = User.objects.create_user(username="photo-other", password="x")
        self.business = Business.objects.create(name="Photo Shop", slug="photo-shop", kind="service", source="owner", plan="pro")
        BusinessMember.objects.create(user=self.owner, business=self.business, role="owner")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.base = f"/api/owner/businesses/{self.business.id}/photos/"

    def upload(self, *files):
        return self.client.post(self.base, {"files": list(files)}, format="multipart")

    def test_upload_several_sets_first_as_cover_and_shows_publicly(self):
        response = self.upload(_image_file("a.jpg"), _image_file("b.png", "PNG"), _image_file("c.webp", "WEBP"))
        self.assertEqual(response.status_code, 201, response.content)
        photos = response.json()["photos"]
        self.assertEqual(len(photos), 3)
        self.assertTrue(photos[0]["is_cover"])
        self.assertEqual(response.json()["limit"], 20)
        public = APIClient().get(f"/api/businesses/{self.business.slug}/").json()
        self.assertEqual(len(public["photos"]), 3)
        self.assertTrue(public["cover_image"])

    def test_gps_exif_is_removed_and_large_images_are_shrunk(self):
        from PIL import Image
        self.upload(_image_file("big.jpg", size=(3000, 1500), exif_gps=True))
        photo = BusinessPhoto.objects.get(business=self.business)
        with Image.open(photo.path.path) as saved:
            self.assertEqual(max(saved.size), 2000)
            self.assertNotIn(0x8825, saved.getexif())

    def test_rejects_wrong_type_fake_images_and_strangers(self):
        bad = self.upload(SimpleUploadedFile("doc.pdf", b"%PDF-1.4", content_type="application/pdf"))
        self.assertEqual(bad.status_code, 400)
        fake = self.upload(SimpleUploadedFile("fake.jpg", b"not really an image", content_type="image/jpeg"))
        self.assertEqual(fake.status_code, 400)
        self.assertIn("not a readable image", fake.json()["detail"])
        stranger = APIClient()
        stranger.force_authenticate(self.other)
        self.assertEqual(stranger.get(self.base).status_code, 404)
        self.assertEqual(stranger.post(self.base, {"files": [_image_file()]}, format="multipart").status_code, 404)
        self.assertEqual(APIClient().get(self.base).status_code, 401)

    def test_free_plan_limit(self):
        self.business.plan = "free"
        self.business.save()
        response = self.upload(*[_image_file(f"{i}.jpg") for i in range(5)])
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.json()["photos"]), 3)
        self.assertTrue(response.json()["errors"])
        self.assertEqual(self.upload(_image_file()).status_code, 400)

    def test_roles_reorder_replace_and_delete(self):
        photos = self.upload(_image_file("a.jpg"), _image_file("b.jpg"), _image_file("c.jpg")).json()["photos"]
        a, b, c = (p["id"] for p in photos)
        logo = self.client.post(f"{self.base}{b}/role/", {"as": "logo"}, format="json").json()["photos"]
        self.assertTrue(next(p for p in logo if p["id"] == b)["is_logo"])
        cover = self.client.post(f"{self.base}{c}/role/", {"as": "cover"}, format="json").json()["photos"]
        self.assertTrue(next(p for p in cover if p["id"] == c)["is_cover"])

        ordered = self.client.put(f"{self.base}order/", {"ids": [c, a, b]}, format="json").json()["photos"]
        self.assertEqual([p["id"] for p in ordered], [c, a, b])
        self.assertEqual(self.client.put(f"{self.base}order/", {"ids": [c, a]}, format="json").status_code, 409)

        old_name = BusinessPhoto.objects.get(id=c).path.name
        replaced = self.client.put(f"{self.base}{c}/", {"file": _image_file("new.png", "PNG")}, format="multipart")
        self.assertEqual(replaced.status_code, 200)
        self.business.refresh_from_db()
        new_name = BusinessPhoto.objects.get(id=c).path.name
        self.assertNotEqual(old_name, new_name)
        self.assertEqual(self.business.cover_image.name, new_name)

        after = self.client.delete(f"{self.base}{c}/").json()["photos"]
        self.assertEqual(len(after), 2)
        self.business.refresh_from_db()
        self.assertEqual(self.business.cover_image.name, BusinessPhoto.objects.get(id=a).path.name)
        self.client.delete(f"{self.base}{b}/")
        self.business.refresh_from_db()
        self.assertFalse(self.business.logo)


class OwnerStatsSeriesTests(TestCase):
    def test_daily_series_and_previous_period(self):
        from datetime import timedelta
        owner = User.objects.create_user(username="stats-owner", password="x")
        business = Business.objects.create(name="Stats Shop", slug="stats-shop", kind="service", source="owner")
        other = Business.objects.create(name="Other", slug="other-stats", kind="service", source="owner")
        BusinessMember.objects.create(user=owner, business=business, role="owner")
        now = timezone.now()
        for days_ago, kind in [(0, "view"), (0, "view"), (1, "call"), (3, "whatsapp"), (20, "view")]:
            event = Event.objects.create(business=business, type=kind)
            Event.objects.filter(pk=event.pk).update(created_at=now - timedelta(days=days_ago))
        Event.objects.create(business=other, type="view")  # not this owner's
        client = APIClient()
        client.force_authenticate(owner)
        body = client.get("/api/owner/stats/").json()
        self.assertEqual(len(body["daily"]), 14)
        self.assertEqual(body["daily"][-1]["view"], 2)
        self.assertEqual(body["last14"], {"view": 2, "call": 1, "whatsapp": 1})
        self.assertEqual(body["prev14"]["view"], 1)
        self.assertEqual(body["view"], 3)


class GuestTeaserAndOfferTests(TestCase):
    LONG = "Trusted family clinic in South Bopal. " * 10

    def setUp(self):
        self.business = Business.objects.create(
            name="Family Clinic", slug="family-clinic", kind="service", source="owner", description=self.LONG,
        )
        self.client = APIClient()

    def test_guest_gets_shortened_description(self):
        data = self.client.get("/api/businesses/family-clinic/").json()
        self.assertTrue(data["description_locked"])
        self.assertLessEqual(len(data["description"]), 121)
        self.assertTrue(data["description"].endswith("…"))
        listing = self.client.get("/api/businesses/").json()
        rows = listing["results"] if isinstance(listing, dict) else listing
        self.assertTrue(all(len(row["description"]) <= 121 for row in rows))

    def test_signed_in_gets_full_description(self):
        self.client.force_authenticate(User.objects.create_user(username="reader2", password="x"))
        data = self.client.get("/api/businesses/family-clinic/").json()
        self.assertFalse(data["description_locked"])
        self.assertEqual(data["description"], self.LONG)

    def test_card_shows_only_approved_unexpired_offer(self):
        today = timezone.localdate()
        BusinessPost.objects.create(business=self.business, title="Pending", status="pending")
        BusinessPost.objects.create(business=self.business, title="Old", status="approved", expires_on=today - timedelta(days=1))
        BusinessPost.objects.create(business=self.business, title="Free check-up", status="approved", expires_on=today)
        listing = self.client.get("/api/businesses/").json()
        rows = listing["results"] if isinstance(listing, dict) else listing
        row = next(row for row in rows if row["slug"] == "family-clinic")
        self.assertEqual(row["offer"]["title"], "Free check-up")


class PublicPlansTests(TestCase):
    def test_lists_plans_with_gst_on_top(self):
        from billing.models import PlanPrice
        PlanPrice.objects.update_or_create(plan="pro", defaults={"monthly_price": 499, "active": True})
        PlanPrice.objects.update_or_create(plan="premium", defaults={"monthly_price": 1999, "active": True})
        data = APIClient().get("/api/plans/").json()
        self.assertEqual(data["gst_percent"], 18)
        by_plan = {row["plan"]: row for row in data["plans"]}
        self.assertEqual(by_plan["pro"]["monthly_total"], 588.82)
        self.assertEqual(by_plan["premium"]["monthly_total"], 2358.82)


@override_settings(MEDIA_ROOT=_PHOTO_MEDIA)
class PhaseCOwnerTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner-c", password="x", email="c@example.test")
        self.business = Business.objects.create(name="Tailor", slug="tailor-c", kind="service", source="owner", hidden=True)
        self.business.members.create(user=self.owner, role="owner")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def test_visit_options_and_gst_saved_and_gst_private(self):
        response = self.client.patch(f"/api/businesses/{self.business.slug}/", {
            "home_visit": True, "onsite_visit": True, "gst_number": "24abcde1234f1z5",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.business.refresh_from_db()
        self.assertTrue(self.business.home_visit)
        self.assertEqual(self.business.gst_number, "24ABCDE1234F1Z5")
        bad = self.client.patch(f"/api/businesses/{self.business.slug}/", {"gst_number": "123"}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.business.hidden = False
        self.business.save()
        public = APIClient().get(f"/api/businesses/{self.business.slug}/").json()
        self.assertNotIn("gst_number", public)
        self.assertTrue(public["home_visit"])

    def test_offer_limit_edit_and_delete(self):
        first = self.client.post("/api/owner/posts/", {"business_id": str(self.business.id), "title": "10% off", "body": "Diwali"}, format="json")
        self.assertEqual(first.status_code, 201)
        second = self.client.post("/api/owner/posts/", {"business_id": str(self.business.id), "title": "Another", "body": "x"}, format="json")
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.json()["code"], "offer_limit")
        post_id = first.json()["id"]
        BusinessPost.objects.filter(id=post_id).update(status="approved")
        edited = self.client.patch(f"/api/owner/posts/{post_id}/", {"title": "15% off", "starts_on": "2026-12-01", "expires_on": "2026-12-10"}, format="json")
        self.assertEqual(edited.status_code, 200, edited.content)
        self.assertEqual(edited.json()["status"], "pending")
        backwards = self.client.patch(f"/api/owner/posts/{post_id}/", {"starts_on": "2026-12-10", "expires_on": "2026-12-01"}, format="json")
        self.assertEqual(backwards.status_code, 400)
        stranger = APIClient()
        stranger.force_authenticate(User.objects.create_user(username="stranger-c", password="x"))
        self.assertEqual(stranger.delete(f"/api/owner/posts/{post_id}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/owner/posts/{post_id}/").status_code, 204)
        self.assertFalse(BusinessPost.objects.filter(id=post_id).exists())

    def test_avatar_upload_and_remove(self):
        response = self.client.post("/api/me/avatar/", {"file": _image_file("me.png", "PNG")}, format="multipart")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(self.client.get("/api/auth/me/").json()["avatar"])
        self.assertEqual(self.client.delete("/api/me/avatar/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me/").json()["avatar"], "")
        bad = self.client.post("/api/me/avatar/", {"file": SimpleUploadedFile("x.txt", b"hello")}, format="multipart")
        self.assertEqual(bad.status_code, 400)
