import uuid

from django.conf import settings
from django.db import models

from directory.models import Business


class PlanPrice(models.Model):
    plan = models.CharField(max_length=10, primary_key=True)
    monthly_price = models.PositiveIntegerField()
    active = models.BooleanField(default=True)
    max_photos = models.PositiveIntegerField(default=3, db_default=3)
    max_active_offers = models.PositiveIntegerField(default=1, db_default=1)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)


class Subscription(models.Model):
    class Status(models.TextChoices):
        TRIAL = "trial", "Trial"
        ACTIVE = "active", "Active"
        GRACE = "grace", "Grace"
        EXPIRED = "expired", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="subscriptions")
    plan = models.CharField(max_length=10)
    status = models.CharField(max_length=10, choices=Status.choices)
    trial = models.BooleanField(default=False)
    starts_on = models.DateTimeField(null=True, blank=True)
    expires_on = models.DateTimeField(null=True, blank=True)
    grace_until = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)


class SubscriptionRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="plan_requests")
    requested_plan = models.CharField(max_length=10, choices=Business.Plan.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("business",),
                condition=models.Q(status="pending"),
                name="one_pending_plan_request_per_business",
            ),
        ]


class Payment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name="payments")
    amount_paise = models.BigIntegerField()
    gst_paise = models.BigIntegerField(default=0)
    method = models.CharField(max_length=20)
    gateway_ref = models.CharField(max_length=200, unique=True, blank=True)
    status = models.CharField(max_length=20)
    paid_on = models.DateTimeField(null=True, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)


class Invoice(models.Model):
    """A monthly bill. It exists before payment; an admin marks it paid when UPI or cash arrives."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        OVERDUE = "overdue", "Overdue"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    seq = models.PositiveIntegerField(unique=True)
    number = models.CharField(max_length=40, unique=True)
    business = models.ForeignKey(Business, on_delete=models.PROTECT, related_name="invoices")
    plan = models.CharField(max_length=10, choices=Business.Plan.choices)
    period_start = models.DateField()
    period_end = models.DateField()
    issued_on = models.DateField()
    due_on = models.DateField()
    amount_paise = models.BigIntegerField()
    gst_percent = models.PositiveSmallIntegerField(default=18)
    gst_paise = models.BigIntegerField()
    total_paise = models.BigIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    # Business details as they were when the invoice was issued.
    business_name = models.CharField(max_length=200)
    business_address = models.TextField(blank=True)
    business_phone = models.CharField(max_length=15, blank=True)
    business_email = models.EmailField(blank=True)
    business_gst = models.CharField(max_length=15, blank=True)
    payment = models.OneToOneField(Payment, null=True, blank=True, on_delete=models.SET_NULL, related_name="invoice")
    paid_on = models.DateTimeField(null=True, blank=True)
    pdf_path = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("business", "period_start"),
                condition=~models.Q(status="cancelled"),
                name="one_open_invoice_per_business_period",
            ),
        ]
        indexes = [models.Index(fields=["status", "due_on"], name="invoice_status_due_idx")]


class AppSetting(models.Model):
    key = models.CharField(max_length=100, primary_key=True)
    value = models.JSONField(default=dict)


GST_PERCENT = 18


def with_gst(rupees):
    """Price including 18% GST, rounded to paise: 499 -> 588.82."""
    return round(rupees * (100 + GST_PERCENT) / 100, 2)
