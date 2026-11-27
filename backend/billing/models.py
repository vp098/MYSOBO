import uuid

from django.conf import settings
from django.db import models

from directory.models import Business


class PlanPrice(models.Model):
    plan = models.CharField(max_length=10, primary_key=True)
    monthly_price = models.PositiveIntegerField()
    active = models.BooleanField(default=True)
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
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.OneToOneField(Payment, on_delete=models.CASCADE, related_name="invoice")
    number = models.CharField(max_length=100, unique=True)
    issued_on = models.DateField()
    pdf_path = models.CharField(max_length=500, blank=True)


class AppSetting(models.Model):
    key = models.CharField(max_length=100, primary_key=True)
    value = models.JSONField(default=dict)
