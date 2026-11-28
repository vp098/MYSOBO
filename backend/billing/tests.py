import tempfile
from datetime import date, timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AdminRole, User
from directory.models import Business

from .models import Invoice, Payment, PlanPrice, Subscription, SubscriptionRequest
from .pdf import rupees
from .services import add_month, create_invoice, run_billing

MEDIA = tempfile.mkdtemp(prefix="mysobo-invoices-")


@override_settings(MEDIA_ROOT=MEDIA, CRON_SECRET="test-cron-secret")
class BillingTests(TestCase):
    def setUp(self):
        for plan, price, photos, offers in (("free", 0, 3, 1), ("pro", 499, 20, 5), ("premium", 1999, 100, 20)):
            PlanPrice.objects.update_or_create(plan=plan, defaults={"monthly_price": price, "max_photos": photos, "max_active_offers": offers})
        self.owner = User.objects.create_user(username="bill-owner", password="x")
        self.business = Business.objects.create(name="Bopal Bakery", slug="bopal-bakery", kind="product", source="owner",
                                                address="Ambli Road", phone="9876500000", gst_number="24ABCDE1234F1Z5")
        self.business.members.create(user=self.owner, role="owner")
        self.admin = User.objects.create_user(username="bill-admin", password="x")
        AdminRole.objects.create(user=self.admin, role=AdminRole.Role.SUPER_ADMIN)
        self.staff = APIClient()
        self.staff.force_authenticate(self.admin)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def approve_pro(self):
        self.client.post("/api/owner/plans/", {"business_id": str(self.business.id), "plan": "pro"}, format="json")
        plan_request = SubscriptionRequest.objects.get(business=self.business)
        return self.staff.post("/api/admin/plan-requests/", {"request_id": str(plan_request.id), "decision": "approve"}, format="json")

    def test_approval_creates_pending_invoice_without_unlocking_the_plan(self):
        response = self.approve_pro()
        self.assertEqual(response.status_code, 200, response.content)
        self.business.refresh_from_db()
        self.assertEqual(self.business.plan, "free")
        invoice = Invoice.objects.get(business=self.business)
        self.assertEqual(invoice.status, "pending")
        self.assertEqual((invoice.amount_paise, invoice.gst_paise, invoice.total_paise), (49900, 8982, 58882))
        self.assertEqual(invoice.number, f"MS-{timezone.localdate().year}-00001")
        self.assertEqual(invoice.business_gst, "24ABCDE1234F1Z5")
        self.assertEqual(invoice.period_end, add_month(invoice.period_start) - timedelta(days=1))

    def test_recording_payment_marks_paid_and_activates_plan(self):
        self.approve_pro()
        invoice = Invoice.objects.get(business=self.business)
        bad = self.staff.post(f"/api/admin/invoices/{invoice.id}/pay/", {"method": "upi"}, format="json")
        self.assertEqual(bad.status_code, 400)  # UPI needs a reference
        paid = self.staff.post(f"/api/admin/invoices/{invoice.id}/pay/", {"method": "upi", "reference": "UTR123"}, format="json")
        self.assertEqual(paid.status_code, 200, paid.content)
        self.assertEqual(paid.json()["status"], "paid")
        self.business.refresh_from_db()
        self.assertEqual(self.business.plan, "pro")
        self.assertEqual(timezone.localdate(self.business.plan_expires_on), invoice.period_end)
        self.assertEqual(Payment.objects.get().amount_paise, 49900)
        again = self.staff.post(f"/api/admin/invoices/{invoice.id}/pay/", {"method": "cash"}, format="json")
        self.assertEqual(again.status_code, 409)
        owner_pay = self.client.post(f"/api/admin/invoices/{invoice.id}/pay/", {"method": "cash"}, format="json")
        self.assertEqual(owner_pay.status_code, 403)

    def test_numbers_are_sequential_and_creation_is_idempotent(self):
        first, made = create_invoice(self.business, "pro", date(2026, 12, 1))
        same, made_again = create_invoice(self.business, "pro", date(2026, 12, 1))
        self.assertTrue(made)
        self.assertFalse(made_again)
        self.assertEqual(first.pk, same.pk)
        second, _ = create_invoice(self.business, "pro", date(2027, 1, 1))
        self.assertEqual(second.seq, first.seq + 1)

    def test_run_billing_renews_marks_overdue_and_expires(self):
        today = timezone.localdate()
        self.business.plan = "pro"
        self.business.plan_expires_on = timezone.now() + timedelta(days=3)
        self.business.save()
        summary = run_billing(today)
        self.assertEqual(summary["created"], 1)
        self.assertEqual(run_billing(today)["created"], 0)  # safe to re-run
        renewal = Invoice.objects.get(business=self.business)
        self.assertEqual(renewal.period_start, timezone.localdate(self.business.plan_expires_on) + timedelta(days=1))
        self.assertEqual(renewal.status, "pending")
        Subscription.objects.create(business=self.business, plan="pro", status="active")
        late = run_billing(renewal.due_on + timedelta(days=1))
        self.assertEqual(late["overdue"], 1)
        self.assertEqual(late["expired"], 1)  # unpaid past the grace period
        renewal.refresh_from_db()
        self.assertEqual(renewal.status, "overdue")  # never marked paid by the system
        self.assertEqual(Subscription.objects.get(business=self.business).status, "expired")
        self.business.refresh_from_db()
        self.assertEqual(self.business.plan, "free")

    def test_cron_endpoint_requires_secret(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get("/api/cron/billing/").status_code, 401)
        self.assertEqual(anonymous.get("/api/cron/billing/", HTTP_AUTHORIZATION="Bearer wrong").status_code, 401)
        ok = anonymous.get("/api/cron/billing/", HTTP_AUTHORIZATION="Bearer test-cron-secret")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(set(ok.json()), {"created", "overdue", "expired"})

    @override_settings(CRON_SECRET="")
    def test_cron_endpoint_off_without_secret(self):
        self.assertEqual(APIClient().get("/api/cron/billing/", HTTP_AUTHORIZATION="Bearer ").status_code, 503)

    def test_pdf_download_for_members_and_admins_only(self):
        self.approve_pro()
        invoice = Invoice.objects.get(business=self.business)
        response = self.client.get(f"/api/invoices/{invoice.id}/pdf/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        body = b"".join(response.streaming_content) if response.streaming else response.content
        self.assertTrue(body.startswith(b"%PDF-1.4"))
        self.assertIn(invoice.number.encode(), body)
        self.assertEqual(self.staff.get(f"/api/invoices/{invoice.id}/pdf/").status_code, 200)
        stranger = APIClient()
        stranger.force_authenticate(User.objects.create_user(username="bill-stranger", password="x"))
        self.assertEqual(stranger.get(f"/api/invoices/{invoice.id}/pdf/").status_code, 404)
        rows = self.client.get("/api/owner/invoices/").json()
        self.assertEqual(rows[0]["total_paise"], 58882)

    def test_admin_edits_plan_limits_and_they_are_enforced(self):
        response = self.staff.put("/api/admin/plans/", {"plan": "free", "max_active_offers": 0}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["monthly_price"], 0)
        blocked = self.client.post("/api/owner/posts/", {"business_id": str(self.business.id), "title": "Hi", "body": "x"}, format="json")
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(self.staff.put("/api/admin/plans/", {"plan": "free", "max_photos": -1}, format="json").status_code, 400)
        public = APIClient().get("/api/plans/").json()["plans"]
        self.assertEqual({row["plan"]: row["max_photos"] for row in public}["pro"], 20)

    def test_rupee_formatting(self):
        self.assertEqual(rupees(58882), "Rs. 588.82")
        self.assertEqual(rupees(12345678), "Rs. 1,23,456.78")
