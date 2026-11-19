from django.test import TestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from accounts.models import AdminRole, Profile, User
from billing.models import Invoice, Payment
from .models import (
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
