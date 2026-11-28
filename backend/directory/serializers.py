from rest_framework import serializers
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify

from .models import (
    Business,
    BusinessHour,
    BusinessProduct,
    BusinessService,
    Category,
    CategoryField,
    Subcategory,
    Claim,
    BusinessPost,
    Report,
    Review,
)


def absolute_file_url(serializer, instance, field_name):
    file_value = getattr(instance, field_name)
    if not file_value:
        return ""
    url = file_value.url
    request = serializer.context.get("request")
    return request.build_absolute_uri(url) if request else url


def validate_category_data(category, subcategory, kind, value):
    if not isinstance(value, dict):
        raise serializers.ValidationError("Category-specific data must be an object.")
    if not category:
        if value:
            raise serializers.ValidationError("Choose a category before adding category-specific data.")
        return value
    fields = list(CategoryField.objects.filter(category=category, active=True))
    allowed_fields = {
        item.key: item for item in fields
        if (item.subcategory_id is None or item.subcategory_id == getattr(subcategory, "id", None))
        and item.applies_to in (kind, "both")
    }
    unknown = set(value) - set(allowed_fields)
    if unknown:
        raise serializers.ValidationError(
            {key: "This field is not configured for the selected category." for key in unknown}
        )
    errors = {}
    for key, field in allowed_fields.items():
        if field.required and (key not in value or value[key] in ("", None)):
            errors[key] = "This field is required."
            continue
        if key not in value or value[key] in ("", None):
            continue
        field_value = value[key]
        if field.field_type == CategoryField.FieldType.TEXT and not isinstance(field_value, str):
            errors[key] = "Enter text."
        elif field.field_type == CategoryField.FieldType.NUMBER and (
            isinstance(field_value, bool) or not isinstance(field_value, (int, float))
        ):
            errors[key] = "Enter a number."
        elif field.field_type == CategoryField.FieldType.BOOLEAN and not isinstance(field_value, bool):
            errors[key] = "Choose yes or no."
        elif field.field_type == CategoryField.FieldType.CHOICE and field_value not in field.options:
            errors[key] = "Choose one of the configured options."
    if errors:
        raise serializers.ValidationError({"category_data": errors})
    return value


class CategorySerializer(serializers.ModelSerializer):
    subcategories = serializers.SerializerMethodField()
    fields = serializers.SerializerMethodField(method_name="get_dynamic_fields")
    listing_count = serializers.IntegerField(read_only=True, default=0)
    icon_image = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = (
            "id", "name", "description", "priority", "slug",
            "supports_services", "supports_products", "active", "icon",
            "icon_image", "image", "listing_count",
            "subcategories", "fields",
        )

    def get_subcategories(self, instance):
        if not self.context.get("include_subcategories"):
            return []
        subcategories = [
            item for item in instance.subcategories.all()
            if item.approved and item.active
        ]
        kind = self.context.get("kind")
        allowed = {
            str(item.id): item for item in subcategories
            if kind not in ("service", "product")
            or (kind == "service" and item.supports_services)
            or (kind == "product" and item.supports_products)
        }
        visible_ids = set()
        while True:
            previous_size = len(visible_ids)
            for item_id, item in allowed.items():
                if item.parent_id is None or str(item.parent_id) in visible_ids:
                    visible_ids.add(item_id)
            if len(visible_ids) == previous_size:
                break
        visible = [item for item in subcategories if str(item.id) in visible_ids]
        return SubcategorySerializer(visible, many=True).data

    def get_dynamic_fields(self, instance):
        fields = [item for item in instance.fields.all() if item.active]
        kind = self.context.get("kind")
        if kind in ("service", "product"):
            fields = [
                item for item in fields
                if item.applies_to in (kind, "both")
            ]
        return CategoryFieldSerializer(fields, many=True).data

    def get_icon_image(self, instance):
        return absolute_file_url(self, instance, "icon_image")

    def get_image(self, instance):
        return absolute_file_url(self, instance, "image")


class SubcategorySerializer(serializers.ModelSerializer):
    parent_id = serializers.UUIDField(read_only=True)
    listing_count = serializers.IntegerField(read_only=True, default=0)
    icon_image = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = Subcategory
        fields = (
            "id", "name", "description", "slug", "parent_id", "approved", "active",
            "priority", "icon", "icon_image", "image", "listing_count",
            "supports_services", "supports_products",
        )

    def get_icon_image(self, instance):
        return absolute_file_url(self, instance, "icon_image")

    def get_image(self, instance):
        return absolute_file_url(self, instance, "image")


class CategoryFieldSerializer(serializers.ModelSerializer):
    subcategory_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = CategoryField
        fields = (
            "id", "key", "label", "field_type", "options", "subcategory_id",
            "applies_to", "required", "filterable", "active", "priority",
        )


class CategoryAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = (
            "id", "name", "description", "slug", "priority", "supports_services",
            "supports_products", "active", "icon", "icon_image", "image",
        )
        extra_kwargs = {"slug": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        supports_services = attrs.get(
            "supports_services", getattr(self.instance, "supports_services", False)
        )
        supports_products = attrs.get(
            "supports_products", getattr(self.instance, "supports_products", False)
        )
        if not supports_services and not supports_products:
            raise serializers.ValidationError(
                "A category must support products, services, or both."
            )
        if self.instance and self.instance.subcategories.exists():
            if not supports_services and self.instance.subcategories.filter(
                active=True, approved=True, supports_services=True
            ).exists():
                raise serializers.ValidationError(
                    {"supports_services": "Update or deactivate service subcategories first."}
                )
            if not supports_products and self.instance.subcategories.filter(
                active=True, approved=True, supports_products=True
            ).exists():
                raise serializers.ValidationError(
                    {"supports_products": "Update or deactivate product subcategories first."}
                )
        name = attrs.get("name", getattr(self.instance, "name", ""))
        slug = attrs.get("slug") or slugify(name)
        candidate = slug
        suffix = 2
        while Category.objects.exclude(pk=getattr(self.instance, "pk", None)).filter(slug=candidate).exists():
            candidate = f"{slug}-{suffix}"
            suffix += 1
        attrs["slug"] = candidate
        return attrs


class SubcategoryAdminSerializer(serializers.ModelSerializer):
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=Category.objects.all()
    )
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent", queryset=Subcategory.objects.all(),
        required=False, allow_null=True,
    )

    class Meta:
        model = Subcategory
        fields = (
            "id", "category_id", "parent_id", "name", "description", "slug", "approved",
            "active", "priority", "supports_services", "supports_products",
            "icon", "icon_image", "image",
        )
        extra_kwargs = {"slug": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        if parent and (parent.category_id != category.id or parent == self.instance):
            raise serializers.ValidationError(
                {"parent_id": "Choose a parent subcategory in the same category."}
            )
        ancestor = parent
        while ancestor:
            if ancestor == self.instance:
                raise serializers.ValidationError(
                    {"parent_id": "A subcategory cannot be nested under its own descendant."}
                )
            ancestor = ancestor.parent
        supports_services = attrs.get(
            "supports_services", getattr(self.instance, "supports_services", False)
        )
        supports_products = attrs.get(
            "supports_products", getattr(self.instance, "supports_products", False)
        )
        if not supports_services and not supports_products:
            raise serializers.ValidationError(
                "A subcategory must support products, services, or both."
            )
        if self.instance and category.id != self.instance.category_id and self.instance.children.exists():
            raise serializers.ValidationError(
                {"category_id": "Move or remove child subcategories before changing this category."}
            )
        if self.instance and not supports_services and self.instance.children.filter(
            active=True, approved=True, supports_services=True
        ).exists():
            raise serializers.ValidationError(
                {"supports_services": "Update or deactivate service child levels first."}
            )
        if self.instance and not supports_products and self.instance.children.filter(
            active=True, approved=True, supports_products=True
        ).exists():
            raise serializers.ValidationError(
                {"supports_products": "Update or deactivate product child levels first."}
            )
        if (supports_services and not category.supports_services) or (
            supports_products and not category.supports_products
        ):
            raise serializers.ValidationError(
                "The subcategory type must be supported by its parent category."
            )
        if parent and (
            (supports_services and not parent.supports_services)
            or (supports_products and not parent.supports_products)
        ):
            raise serializers.ValidationError(
                "The subcategory type must be supported by its parent level."
            )
        name = attrs.get("name", getattr(self.instance, "name", ""))
        slug = attrs.get("slug") or slugify(name)
        candidate = slug
        suffix = 2
        queryset = Subcategory.objects.filter(category=category).exclude(
            pk=getattr(self.instance, "pk", None)
        )
        while queryset.filter(slug=candidate).exists():
            candidate = f"{slug}-{suffix}"
            suffix += 1
        attrs["slug"] = candidate
        return attrs


class CategoryFieldAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoryField
        fields = (
            "id", "category", "subcategory", "key", "label", "field_type",
            "options", "applies_to", "required", "filterable", "active", "priority",
        )
        extra_kwargs = {"key": {"required": False, "allow_blank": True}}

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        subcategory = attrs.get("subcategory", getattr(self.instance, "subcategory", None))
        if subcategory and subcategory.category_id != category.id:
            raise serializers.ValidationError(
                {"subcategory": "Choose a subcategory within this category."}
            )
        field_type = attrs.get("field_type", getattr(self.instance, "field_type", "text"))
        options = attrs.get("options", getattr(self.instance, "options", []))
        if field_type == CategoryField.FieldType.CHOICE and (
            not isinstance(options, list) or not options or not all(isinstance(item, str) for item in options)
        ):
            raise serializers.ValidationError(
                {"options": "Choice fields require a list of option strings."}
            )
        key = attrs.get("key") or slugify(attrs.get("label", getattr(self.instance, "label", "")))
        candidate = key
        suffix = 2
        queryset = CategoryField.objects.filter(category=category).exclude(
            pk=getattr(self.instance, "pk", None)
        )
        while queryset.filter(key=candidate).exists():
            candidate = f"{key}-{suffix}"
            suffix += 1
        attrs["key"] = candidate
        return attrs



def _viewer_access(context, user):
    """Businesses the viewer manages and whether they are staff, computed once
    per response (a list of 20 businesses no longer costs 40 extra queries)."""
    if not (user and user.is_authenticated):
        return frozenset(), False
    cached = context.get("_viewer_access")
    if cached is None:
        from .models import BusinessMember
        member_ids = frozenset(BusinessMember.objects.filter(user=user).values_list("business_id", flat=True))
        cached = (member_ids, user.admin_roles.exists())
        context["_viewer_access"] = cached
    return cached


def active_offers(queryset):
    today = timezone.localdate()
    return queryset.filter(status=BusinessPost.Status.APPROVED).filter(
        Q(expires_on__isnull=True) | Q(expires_on__gte=today)
    ).order_by("-created_at")


CONTACT_FIELDS = ("phone", "whatsapp", "email")
GUEST_DESCRIPTION_CHARS = 120


def shorten(text, limit=GUEST_DESCRIPTION_CHARS):
    """Cut text at a word boundary so guests get a teaser, not the full write-up."""
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text, False
    cut = text[:limit].rsplit(" ", 1)[0] or text[:limit]
    return cut.rstrip(",.;:-") + "…", True


def mask_phone(value):
    """Show only the last two digits, e.g. "98XXX XXX12"."""
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if len(digits) < 4:
        return ""
    digits = digits[-10:]
    hidden = "X" * (len(digits) - 2) + digits[-2:]
    return f"{hidden[:5]} {hidden[5:]}" if len(hidden) > 5 else hidden


def hide_contact_details(data, user):
    """Residents must sign in to see a business's phone, WhatsApp, email and full description."""
    if user and user.is_authenticated:
        data["contact_locked"] = False
        data["description_locked"] = False
        return data
    if "description" in data:
        data["description"], data["description_locked"] = shorten(data["description"])
    has_contact = any(data.get(field) for field in CONTACT_FIELDS if field in data)
    for field in ("phone", "whatsapp"):
        if field in data:
            data[f"{field}_masked"] = mask_phone(data[field])
            data[field] = ""
    if "email" in data:
        data["email"] = ""
    data["contact_locked"] = has_contact
    return data


class BusinessSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    subcategory = SubcategorySerializer(read_only=True)
    category_id = serializers.UUIDField(write_only=True, required=False)
    subcategory_id = serializers.UUIDField(write_only=True, required=False)
    photos = serializers.SerializerMethodField()
    hours = serializers.SerializerMethodField()
    average_rating = serializers.FloatField(read_only=True, default=None)
    review_count = serializers.IntegerField(read_only=True, default=0)
    verified = serializers.SerializerMethodField()
    offer = serializers.SerializerMethodField()

    class Meta:
        model = Business
        fields = (
            "id", "slug", "name", "kind", "category", "subcategory", "category_id",
            "subcategory_id", "description", "category_data", "phone", "whatsapp",
            "email", "website", "logo", "cover_image", "address",
            "hide_address", "lat", "lng", "society", "specialties", "photos", "hours",
            "average_rating", "review_count", "verified", "offer",
            "verification_level", "source", "hidden", "plan", "plan_expires_on",
            "approval_requested_at", "deleted_at", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "verification_level", "source", "hidden", "plan",
            "plan_expires_on", "approval_requested_at", "deleted_at", "created_at", "updated_at",
        )

    def create(self, validated_data):
        category_id = validated_data.pop("category_id", None)
        subcategory_id = validated_data.pop("subcategory_id", None)
        if category_id:
            validated_data["category"] = Category.objects.get(id=category_id)
        if subcategory_id:
            validated_data["subcategory"] = Subcategory.objects.get(id=subcategory_id)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        category_id = validated_data.pop("category_id", None)
        subcategory_id = validated_data.pop("subcategory_id", None)
        if category_id:
            validated_data["category"] = Category.objects.get(id=category_id)
        elif "category_id" in self.initial_data:
            validated_data["category"] = None
        if subcategory_id:
            validated_data["subcategory"] = Subcategory.objects.get(id=subcategory_id)
        elif "subcategory_id" in self.initial_data:
            validated_data["subcategory"] = None
        elif "category" in validated_data and instance.subcategory_id:
            validated_data["subcategory"] = None
        return super().update(instance, validated_data)

    def validate(self, attrs):
        category_id = attrs.get("category_id")
        subcategory_id = attrs.get("subcategory_id")
        if category_id and not Category.objects.filter(id=category_id).exists():
            raise serializers.ValidationError({"category_id": "Choose a valid category."})
        target_category_id = category_id or getattr(self.instance, "category_id", None)
        category = Category.objects.filter(id=target_category_id).first() if target_category_id else None
        kind = attrs.get("kind", getattr(self.instance, "kind", Business.Kind.SERVICE))
        category_supports_kind = {
            Business.Kind.SERVICE: bool(category and category.supports_services),
            Business.Kind.PRODUCT: bool(category and category.supports_products),
            Business.Kind.BOTH: bool(
                category and category.supports_services and category.supports_products
            ),
        }
        if category and not category_supports_kind.get(kind, False):
            raise serializers.ValidationError(
                {"category_id": f"This category is not available for {kind} listings."}
            )
        if subcategory_id:
            subcategory = Subcategory.objects.filter(
                id=subcategory_id,
                category_id=target_category_id,
                approved=True,
                active=True,
            ).first()
            if not subcategory:
                raise serializers.ValidationError({"subcategory_id": "Choose an approved subcategory for this category."})
        elif (
            self.instance
            and self.instance.subcategory_id
            and self.instance.subcategory.category_id == target_category_id
        ):
            subcategory = self.instance.subcategory
        else:
            subcategory = None
        if subcategory:
            subcategory_supports_kind = {
                Business.Kind.SERVICE: subcategory.supports_services,
                Business.Kind.PRODUCT: subcategory.supports_products,
                Business.Kind.BOTH: subcategory.supports_services and subcategory.supports_products,
            }
            if not subcategory_supports_kind.get(kind, False):
                raise serializers.ValidationError(
                    {"subcategory_id": f"This subcategory is not available for {kind} listings."}
                )
        if (
            self.instance
            and category_id
            and not subcategory_id
            and self.instance.subcategory_id
            and self.instance.subcategory.category_id != category_id
        ):
            attrs["subcategory_id"] = None
        category_data = attrs.get(
            "category_data", getattr(self.instance, "category_data", {})
        )
        validate_category_data(category, subcategory, kind, category_data)
        return attrs

    def get_photos(self, instance):
        return [
            absolute_file_url(self, photo, "path")
            for photo in instance.photos.all()
            if photo.path
        ]

    def get_hours(self, instance):
        return BusinessHourSerializer(instance.hours.all(), many=True).data

    def get_offer(self, instance):
        """The newest approved offer that has not expired, for the listing card."""
        offers = getattr(instance, "active_offers", None)
        if offers is None:
            offers = active_offers(BusinessPost.objects.filter(business=instance))[:1]
        offer = next(iter(offers), None)
        if not offer:
            return None
        return {"id": str(offer.id), "title": offer.title or offer.body[:80], "expires_on": offer.expires_on}

    def get_verified(self, instance):
        return instance.verification_level >= 2

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        member_ids, admin = _viewer_access(self.context, user)
        member = instance.pk in member_ids
        privileged = member or admin or getattr(user, "is_superuser", False)
        if (instance.hide_address or instance.hidden) and not privileged:
            data["address"] = None
        if not privileged:
            for field in (
                "verification_level",
                "source",
                "hidden",
                "plan",
                "plan_expires_on",
                "deleted_at",
            ):
                data.pop(field, None)
        return hide_contact_details(data, user)


class BusinessHourSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessHour
        fields = ("dow", "opens", "closes", "closed")


class BusinessSummarySerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default="")
    subcategory_name = serializers.CharField(source="subcategory.name", read_only=True, default="")
    address = serializers.SerializerMethodField()
    verified = serializers.SerializerMethodField()

    class Meta:
        model = Business
        fields = (
            "id", "slug", "name", "kind", "description", "phone", "whatsapp",
            "address", "verified", "category_name", "subcategory_name",
        )

    def get_verified(self, instance):
        return instance.verification_level >= 2

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        return hide_contact_details(data, getattr(request, "user", None))

    def get_address(self, instance):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        member = bool(
            user and user.is_authenticated
            and instance.members.filter(user=user).exists()
        )
        admin = bool(user and user.is_authenticated and user.admin_roles.exists())
        privileged = member or admin or getattr(user, "is_superuser", False)
        if (instance.hide_address or instance.hidden) and not privileged:
            return None
        return instance.address


class BusinessProductSerializer(serializers.ModelSerializer):
    business = BusinessSummarySerializer(read_only=True)
    business_id = serializers.PrimaryKeyRelatedField(
        source="business", queryset=Business.objects.all(), write_only=True, required=False
    )
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=Category.objects.all(), write_only=True
    )
    subcategory = SubcategorySerializer(read_only=True)
    subcategory_id = serializers.PrimaryKeyRelatedField(
        source="subcategory", queryset=Subcategory.objects.all(),
        write_only=True, required=False, allow_null=True,
    )

    class Meta:
        model = BusinessProduct
        fields = (
            "id", "business", "business_id", "category", "category_id",
            "subcategory", "subcategory_id", "name", "brand", "model",
            "description", "price", "available", "active", "image",
            "category_data", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        business = attrs.get("business", getattr(self.instance, "business", None))
        category = attrs.get("category", getattr(self.instance, "category", None))
        subcategory = attrs.get("subcategory", getattr(self.instance, "subcategory", None))
        if not business:
            raise serializers.ValidationError({"business_id": "Choose a business."})
        if business.kind not in (Business.Kind.PRODUCT, Business.Kind.BOTH):
            raise serializers.ValidationError({"business_id": "This business does not offer products."})
        if not category.active or not category.supports_products:
            raise serializers.ValidationError({"category_id": "Choose a product category."})
        if subcategory and (
            subcategory.category_id != category.id
            or not subcategory.active
            or not subcategory.approved
            or not subcategory.supports_products
        ):
            raise serializers.ValidationError({"subcategory_id": "Choose an active product subcategory in this category."})
        category_data = attrs.get(
            "category_data", getattr(self.instance, "category_data", {})
        )
        validate_category_data(category, subcategory, Business.Kind.PRODUCT, category_data)
        price = attrs.get("price", getattr(self.instance, "price", None))
        if price is not None and price < 0:
            raise serializers.ValidationError({"price": "Price cannot be negative."})
        return attrs


class BusinessServiceSerializer(serializers.ModelSerializer):
    business = BusinessSummarySerializer(read_only=True)
    business_id = serializers.PrimaryKeyRelatedField(
        source="business", queryset=Business.objects.all(), write_only=True, required=False
    )
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=Category.objects.all(), write_only=True
    )
    subcategory = SubcategorySerializer(read_only=True)
    subcategory_id = serializers.PrimaryKeyRelatedField(
        source="subcategory", queryset=Subcategory.objects.all(),
        write_only=True, required=False, allow_null=True,
    )

    class Meta:
        model = BusinessService
        fields = (
            "id", "business", "business_id", "category", "category_id",
            "subcategory", "subcategory_id", "name", "description",
            "service_area", "experience_years", "price_min", "price_max",
            "available", "active", "category_data", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        business = attrs.get("business", getattr(self.instance, "business", None))
        category = attrs.get("category", getattr(self.instance, "category", None))
        subcategory = attrs.get("subcategory", getattr(self.instance, "subcategory", None))
        if not business:
            raise serializers.ValidationError({"business_id": "Choose a business."})
        if business.kind not in (Business.Kind.SERVICE, Business.Kind.BOTH):
            raise serializers.ValidationError({"business_id": "This business does not offer services."})
        if not category.active or not category.supports_services:
            raise serializers.ValidationError({"category_id": "Choose a service category."})
        if subcategory and (
            subcategory.category_id != category.id
            or not subcategory.active
            or not subcategory.approved
            or not subcategory.supports_services
        ):
            raise serializers.ValidationError({"subcategory_id": "Choose an active service subcategory in this category."})
        price_min = attrs.get("price_min", getattr(self.instance, "price_min", None))
        price_max = attrs.get("price_max", getattr(self.instance, "price_max", None))
        if price_min is not None and price_max is not None and price_min > price_max:
            raise serializers.ValidationError({"price_max": "Price maximum must be greater than or equal to price minimum."})
        category_data = attrs.get(
            "category_data", getattr(self.instance, "category_data", {})
        )
        validate_category_data(category, subcategory, Business.Kind.SERVICE, category_data)
        return attrs


class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    mine = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ("id", "rating", "body", "user_name", "mine", "created_at")
        read_only_fields = ("id", "user_name", "mine", "created_at")

    def get_mine(self, instance):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and instance.user_id == user.pk)

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value

    def get_user_name(self, instance):
        """Public display name like "Hetal S.". Never the username, which can contain a mobile number."""
        user = instance.user
        profile_name = getattr(getattr(user, "profile", None), "name", "") or ""
        words = f"{user.first_name} {user.last_name}".split() or profile_name.split()
        if not words:
            return "Resident"
        return f"{words[0]} {words[1][0]}." if len(words) > 1 else words[0]


class BusinessPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessPost
        fields = ("id", "business", "title", "body", "image_path", "expires_on", "status", "created_at")
        read_only_fields = ("id", "status", "created_at")
