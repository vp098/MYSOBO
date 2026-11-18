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
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


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
