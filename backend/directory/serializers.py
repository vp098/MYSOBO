from rest_framework import serializers

from .models import Business, Category, Subcategory, Claim, BusinessPost, Report


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ("id", "name", "priority", "slug")


class SubcategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Subcategory
        fields = ("id", "name", "slug", "approved")


class BusinessSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    subcategory = SubcategorySerializer(read_only=True)
    category_id = serializers.UUIDField(write_only=True, required=False)
    subcategory_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = Business
        fields = (
            "id", "slug", "name", "kind", "category", "subcategory", "category_id",
            "subcategory_id", "description", "phone", "whatsapp", "address",
            "hide_address", "lat", "lng", "society", "specialties",
            "verification_level", "source", "hidden", "plan", "plan_expires_on",
            "deleted_at", "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "verification_level", "source", "hidden", "plan",
            "plan_expires_on", "deleted_at", "created_at", "updated_at",
        )

    def create(self, validated_data):
        category_id = validated_data.pop("category_id", None)
        subcategory_id = validated_data.pop("subcategory_id", None)
        if category_id:
            validated_data["category"] = Category.objects.filter(id=category_id).first()
        if subcategory_id:
            validated_data["subcategory"] = Subcategory.objects.filter(id=subcategory_id).first()
        return super().create(validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        member = bool(user and user.is_authenticated and instance.members.filter(user=user).exists())
        admin = bool(user and user.is_authenticated and user.admin_roles.exists())
        if instance.hide_address and not (member or admin):
            data["address"] = None
        return data
