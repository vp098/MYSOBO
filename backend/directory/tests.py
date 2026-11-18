from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Profile, User
from .models import Business, BusinessMember, Category


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
