import uuid

from django.conf import settings
from django.db import models

from accounts.models import Society


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    priority = models.IntegerField(default=0)
    slug = models.SlugField(unique=True)

    class Meta:
        verbose_name_plural = "categories"
        ordering = ("priority", "name")


class Subcategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="subcategories")
    name = models.CharField(max_length=200)
    slug = models.SlugField(blank=True)
    approved = models.BooleanField(default=True)
    suggested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        verbose_name_plural = "subcategories"
        unique_together = ("category", "slug")


class Business(models.Model):
    class Kind(models.TextChoices):
        SERVICE = "service", "Service"
        PRODUCT = "product", "Product"
        BOTH = "both", "Both"

    class Plan(models.TextChoices):
        FREE = "free", "Free"
        PRO = "pro", "Pro"
        PREMIUM = "premium", "Premium"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.SERVICE)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    subcategory = models.ForeignKey(Subcategory, null=True, blank=True, on_delete=models.SET_NULL)
    description = models.TextField(blank=True)
    phone = models.CharField(max_length=15, blank=True)
    whatsapp = models.CharField(max_length=15, blank=True)
    address = models.TextField(blank=True)
    hide_address = models.BooleanField(default=False)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    society = models.ForeignKey(Society, null=True, blank=True, on_delete=models.SET_NULL)
    specialties = models.JSONField(default=dict)
    verification_level = models.PositiveSmallIntegerField(default=0)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    verified_on = models.DateTimeField(null=True, blank=True)
    verification_note = models.TextField(blank=True)
    source = models.CharField(max_length=50)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    hidden = models.BooleanField(default=False)
    plan = models.CharField(max_length=10, choices=Plan.choices, default=Plan.FREE)
    plan_expires_on = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["category", "verification_level"]),
            models.Index(fields=["society"]),
        ]
        ordering = ("-created_at",)


class BusinessMember(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        MANAGER = "manager", "Manager"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="members")
    role = models.CharField(max_length=10, choices=Role.choices)

    class Meta:
        unique_together = ("user", "business")


class Claim(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    proof_path = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class BusinessHour(models.Model):
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="hours")
    dow = models.PositiveSmallIntegerField()
    opens = models.TimeField(null=True, blank=True)
    closes = models.TimeField(null=True, blank=True)
    closed = models.BooleanField(default=False)

    class Meta:
        unique_together = ("business", "dow")


class BusinessPhoto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="photos")
    path = models.ImageField(upload_to="business-photos/")
    sort = models.IntegerField(default=0)


class BusinessPost(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="posts")
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField(blank=True)
    image_path = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)


class CivicUpdate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    body = models.TextField()
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class SavedBusiness(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    business = models.ForeignKey(Business, on_delete=models.CASCADE)

    class Meta:
        unique_together = ("user", "business")


class Report(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE)
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    reason = models.TextField()
    status = models.CharField(max_length=20, default="open")
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)


class Event(models.Model):
    id = models.BigAutoField(primary_key=True)
    business = models.ForeignKey(Business, null=True, blank=True, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    type = models.CharField(max_length=30)
    created_at = models.DateTimeField(auto_now_add=True)


class EventDaily(models.Model):
    day = models.DateField()
    business = models.ForeignKey(Business, on_delete=models.CASCADE)
    type = models.CharField(max_length=30)
    n = models.IntegerField(default=0)

    class Meta:
        unique_together = ("day", "business", "type")


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=100)
    target_type = models.CharField(max_length=100, blank=True)
    target_id = models.CharField(max_length=100, blank=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
