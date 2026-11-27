import uuid

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.core.validators import FileExtensionValidator

from accounts.models import Society


category_image_validator = FileExtensionValidator(
    allowed_extensions=("jpg", "jpeg", "png", "webp")
)


class Category(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    priority = models.IntegerField(default=0)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    supports_services = models.BooleanField(default=True)
    supports_products = models.BooleanField(default=True)
    active = models.BooleanField(default=True)
    icon = models.CharField(max_length=100, blank=True)
    icon_image = models.FileField(
        upload_to="category-icons/", blank=True, validators=[category_image_validator]
    )
    image = models.FileField(
        upload_to="category-images/", blank=True, validators=[category_image_validator]
    )

    class Meta:
        verbose_name_plural = "categories"
        ordering = ("priority", "name")


class Subcategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="subcategories")
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )
    name = models.CharField(max_length=200)
    slug = models.SlugField(blank=True)
    description = models.TextField(blank=True)
    approved = models.BooleanField(default=True)
    supports_services = models.BooleanField(default=True)
    supports_products = models.BooleanField(default=True)
    active = models.BooleanField(default=True)
    priority = models.IntegerField(default=0)
    icon = models.CharField(max_length=100, blank=True)
    icon_image = models.FileField(
        upload_to="subcategory-icons/", blank=True, validators=[category_image_validator]
    )
    image = models.FileField(
        upload_to="subcategory-images/", blank=True, validators=[category_image_validator]
    )
    suggested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        verbose_name_plural = "subcategories"
        unique_together = ("category", "slug")
        ordering = ("priority", "name")


class CategoryField(models.Model):
    class FieldType(models.TextChoices):
        TEXT = "text", "Text"
        NUMBER = "number", "Number"
        BOOLEAN = "boolean", "Yes/No"
        CHOICE = "choice", "Choice"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="fields")
    subcategory = models.ForeignKey(
        Subcategory, null=True, blank=True, on_delete=models.CASCADE, related_name="fields"
    )
    key = models.SlugField(max_length=100)
    label = models.CharField(max_length=150)
    field_type = models.CharField(max_length=10, choices=FieldType.choices, default=FieldType.TEXT)
    options = models.JSONField(default=list, blank=True)
    applies_to = models.CharField(
        max_length=10,
        choices=(("service", "Service"), ("product", "Product"), ("both", "Both")),
        default="both",
    )
    required = models.BooleanField(default=False)
    filterable = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    priority = models.IntegerField(default=0)

    class Meta:
        ordering = ("priority", "label")
        unique_together = ("category", "key")


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
    category_data = models.JSONField(default=dict, blank=True)
    phone = models.CharField(max_length=15, blank=True)
    whatsapp = models.CharField(max_length=15, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    logo = models.FileField(upload_to="business-logos/", blank=True)
    cover_image = models.FileField(upload_to="business-covers/", blank=True)
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
    approval_requested_at = models.DateTimeField(null=True, blank=True)
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
            models.Index(
                fields=["category", "verification_level", "hidden", "deleted_at"],
                name="business_cat_ver_hid_del_idx",
            ),
            models.Index(fields=["society", "deleted_at"], name="business_society_del_idx"),
            models.Index(fields=["hidden", "deleted_at", "-created_at"], name="business_public_recent_idx"),
            models.Index(fields=["society"]),
            GinIndex(fields=["name"], opclasses=["gin_trgm_ops"], name="business_name_trgm_idx"),
            GinIndex(
                fields=["description"],
                opclasses=["gin_trgm_ops"],
                name="business_description_trgm_idx",
            ),
        ]
        ordering = ("-created_at",)


class BusinessProduct(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="products")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    subcategory = models.ForeignKey(
        Subcategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="products"
    )
    name = models.CharField(max_length=200)
    brand = models.CharField(max_length=150, blank=True)
    model = models.CharField(max_length=150, blank=True)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    available = models.BooleanField(default=True)
    active = models.BooleanField(default=True)
    image = models.FileField(upload_to="products/", blank=True)
    category_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        indexes = [models.Index(fields=("category", "active", "available"))]


class BusinessService(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="services")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="services")
    subcategory = models.ForeignKey(
        Subcategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="services"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    service_area = models.CharField(max_length=250, blank=True)
    experience_years = models.PositiveSmallIntegerField(null=True, blank=True)
    price_min = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    price_max = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    available = models.BooleanField(default=True)
    active = models.BooleanField(default=True)
    category_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        indexes = [models.Index(fields=("category", "active", "available"))]


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

    class Meta:
        constraints = [
            # One open listing request per person per business, even if two
            # taps arrive at the same moment.
            models.UniqueConstraint(
                fields=("user", "business"),
                condition=models.Q(status="pending"),
                name="claim_one_pending_per_user_business",
            ),
        ]


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
    expires_on = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["business", "status", "expires_on"], name="post_business_status_idx")]


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


class Review(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    rating = models.PositiveSmallIntegerField()
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "business")
        ordering = ("-created_at",)


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

    class Meta:
        indexes = [models.Index(fields=["business", "type", "created_at"], name="event_business_type_time_idx")]


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
