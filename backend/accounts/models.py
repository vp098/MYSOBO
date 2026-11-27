import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mobile = models.CharField(max_length=15, unique=True, null=True, blank=True)


class Society(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    area = models.CharField(max_length=200, blank=True)

    class Meta:
        verbose_name_plural = "societies"


class Profile(models.Model):
    id = models.OneToOneField(User, primary_key=True, on_delete=models.CASCADE, related_name="profile")
    name = models.CharField(max_length=200, blank=True)
    mobile = models.CharField(max_length=15, unique=True, null=True, blank=True)
    society = models.ForeignKey(Society, null=True, blank=True, on_delete=models.SET_NULL)
    consent_at = models.DateTimeField(null=True, blank=True)
    consent_version = models.CharField(max_length=32, blank=True)
    whatsapp_alerts = models.BooleanField(default=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class OTPChallenge(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mobile = models.CharField(max_length=15)
    code_hash = models.CharField(max_length=128)
    request_ip = models.GenericIPAddressField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    consent_version = models.CharField(max_length=32, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("mobile", "created_at")),
            models.Index(fields=("request_ip", "created_at")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("mobile",),
                condition=models.Q(consumed_at__isnull=True),
                name="one_active_otp_per_mobile",
            ),
        ]


class AdminRole(models.Model):
    class Role(models.TextChoices):
        FIELD_AGENT = "field_agent", "Field agent"
        VERIFIER = "verifier", "Verifier"
        FINANCE = "finance", "Finance"
        SUPER_ADMIN = "super_admin", "Super admin"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="admin_roles")
    role = models.CharField(max_length=20, choices=Role.choices)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "role")
