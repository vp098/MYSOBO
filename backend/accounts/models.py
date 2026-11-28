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
    avatar = models.FileField(upload_to="avatars/", blank=True, default="", db_default="")

    class AccountType(models.TextChoices):
        RESIDENT = "resident", "Resident"
        BUSINESS_OWNER = "business_owner", "Business owner"

    class Theme(models.TextChoices):
        WARM_WHITE = "warm", "Warm white"
        SOFT_NEUTRAL = "neutral", "Soft neutral"
        PROFESSIONAL_LIGHT = "light", "Professional light"
        DARK = "dark", "Dark"

    account_type = models.CharField(max_length=20, choices=AccountType.choices, default=AccountType.RESIDENT, db_default=AccountType.RESIDENT)
    theme = models.CharField(max_length=10, choices=Theme.choices, default=Theme.WARM_WHITE, db_default=Theme.WARM_WHITE)
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


class SocialIdentity(models.Model):
    """A sign-in provider account (Google) linked to a MySobo user.

    `subject` is Google's stable user id ("sub"), so a person keeps the same
    MySobo account even if their Google email changes.
    """

    class Provider(models.TextChoices):
        GOOGLE = "google", "Google"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="identities")
    provider = models.CharField(max_length=20, choices=Provider.choices)
    subject = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    email_verified = models.BooleanField(default=False)
    name = models.CharField(max_length=200, blank=True)
    picture = models.URLField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("provider", "subject"), name="unique_provider_subject"),
            models.UniqueConstraint(fields=("user", "provider"), name="one_identity_per_provider_per_user"),
        ]
