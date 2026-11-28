from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AdminRole, User
from directory.models import Business

from .models import Ticket


class SupportTicketTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="sup-owner", password="x", email="o@example.test", first_name="Ravi")
        self.business = Business.objects.create(name="Ravi Repairs", slug="ravi-repairs", kind="service", source="owner")
        self.business.members.create(user=self.owner, role="owner")
        self.admin = User.objects.create_user(username="sup-admin", password="x", first_name="Nisha")
        AdminRole.objects.create(user=self.admin, role=AdminRole.Role.SUPER_ADMIN)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.staff = APIClient()
        self.staff.force_authenticate(self.admin)

    def open_ticket(self, **extra):
        body = {"plan": "pro", "category": "billing", "subject": "Invoice question",
                "description": "My invoice shows the wrong period.", "business_id": str(self.business.id), **extra}
        return self.client.post("/api/support/tickets/", body, format="json")

    def test_open_ticket_needs_plan_and_details(self):
        self.assertEqual(self.open_ticket(plan="").status_code, 400)
        self.assertEqual(self.open_ticket(category="x").status_code, 400)
        self.assertEqual(self.open_ticket(subject="a").status_code, 400)
        response = self.open_ticket()
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual(data["code"], "T-00001")
        self.assertEqual(data["status"], "open")
        self.assertEqual(data["business"], "Ravi Repairs")
        self.assertEqual(self.open_ticket().json()["code"], "T-00002")

    def test_business_must_be_your_own(self):
        other = Business.objects.create(name="Other", slug="other-biz", kind="service", source="owner")
        self.assertEqual(self.open_ticket(business_id=str(other.id)).status_code, 400)

    def test_guests_cannot_open_tickets(self):
        response = APIClient().post("/api/support/tickets/", {"plan": "free"}, format="json")
        self.assertIn(response.status_code, (401, 403))

    def test_admin_reply_resolve_and_user_reopen(self):
        ticket_id = self.open_ticket().json()["id"]
        reply = self.staff.post(f"/api/admin/tickets/{ticket_id}/", {"body": "Fixed the period, please check."}, format="json")
        self.assertEqual(reply.status_code, 200, reply.content)
        self.assertEqual(reply.json()["status"], "waiting")
        resolved = self.staff.post(f"/api/admin/tickets/{ticket_id}/", {"status": "resolved"}, format="json")
        self.assertEqual(resolved.json()["status"], "resolved")
        mine = self.client.get(f"/api/support/tickets/{ticket_id}/").json()
        staff_messages = [event for event in mine["events"] if event["staff"] and event["kind"] == "message"]
        self.assertEqual(staff_messages[0]["author"], "MySobo team")
        self.assertEqual([event["to_status"] for event in mine["events"] if event["kind"] == "status"], ["waiting", "resolved"])
        reopened = self.client.post(f"/api/support/tickets/{ticket_id}/reply/", {"body": "Still wrong."}, format="json")
        self.assertEqual(reopened.json()["status"], "open")
        closed = self.client.post(f"/api/support/tickets/{ticket_id}/reply/", {"close": True}, format="json")
        self.assertEqual(closed.json()["status"], "closed")
        self.assertEqual(self.client.post(f"/api/support/tickets/{ticket_id}/reply/", {"body": "hi"}, format="json").status_code, 409)

    def test_privacy_and_admin_only_actions(self):
        ticket_id = self.open_ticket().json()["id"]
        stranger = APIClient()
        stranger.force_authenticate(User.objects.create_user(username="sup-stranger", password="x"))
        self.assertEqual(stranger.get(f"/api/support/tickets/{ticket_id}/").status_code, 404)
        self.assertEqual(stranger.post(f"/api/support/tickets/{ticket_id}/reply/", {"body": "x"}, format="json").status_code, 404)
        self.assertEqual(self.client.post(f"/api/admin/tickets/{ticket_id}/", {"status": "resolved"}, format="json").status_code, 403)
        self.assertEqual(self.client.get("/api/admin/tickets/").status_code, 403)
        rows = self.staff.get("/api/admin/tickets/?status=active").json()
        self.assertEqual(rows[0]["user"], "Ravi")
        self.assertEqual(self.staff.get("/api/admin/tickets/?status=resolved").json(), [])
        self.assertEqual(Ticket.objects.count(), 1)
