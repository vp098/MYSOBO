from django.contrib import admin

from .models import (
    Business,
    BusinessHour,
    BusinessPhoto,
    BusinessProduct,
    BusinessService,
    Category,
    CategoryField,
    Subcategory,
)


class SubcategoryInline(admin.TabularInline):
    model = Subcategory
    extra = 0
    fields = (
        "parent", "name", "slug", "priority", "approved", "active",
        "supports_services", "supports_products", "description", "icon", "icon_image", "image",
    )
    prepopulated_fields = {"slug": ("name",)}


class BusinessHourInline(admin.TabularInline):
    model = BusinessHour
    extra = 0


class BusinessPhotoInline(admin.TabularInline):
    model = BusinessPhoto
    extra = 0


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = (
        "name", "kind", "category", "verification_level", "hidden", "plan", "created_at",
    )
    list_filter = ("kind", "category", "verification_level", "hidden", "plan")
    search_fields = ("name", "slug", "phone", "email")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("id", "created_at", "updated_at")
    fieldsets = (
        (None, {
            "fields": (
                "name", "slug", "kind", "category", "subcategory", "description", "category_data",
            ),
        }),
        ("Contact", {
            "fields": (
                "phone", "whatsapp", "email", "website", "address", "hide_address", "society",
            ),
        }),
        ("Images", {"fields": ("logo", "cover_image")}),
        ("Moderation and plan", {
            "fields": (
                "source", "created_by", "verification_level", "verified_by", "verified_on",
                "verification_note", "hidden", "plan", "plan_expires_on", "deleted_at",
            ),
        }),
        ("Record details", {"fields": ("id", "created_at", "updated_at")}),
    )
    inlines = (BusinessHourInline, BusinessPhotoInline)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "priority", "supports_services", "supports_products", "active")
    list_filter = ("supports_services", "supports_products", "active")
    search_fields = ("name", "slug")
    list_editable = ("priority", "supports_services", "supports_products", "active")
    fields = (
        "name", "slug", "description", "priority", "supports_services", "supports_products",
        "active", "icon", "icon_image", "image",
    )
    prepopulated_fields = {"slug": ("name",)}
    inlines = (SubcategoryInline,)


@admin.register(CategoryField)
class CategoryFieldAdmin(admin.ModelAdmin):
    list_display = ("label", "category", "subcategory", "field_type", "applies_to", "filterable", "active")
    list_filter = ("field_type", "applies_to", "filterable", "active")
    search_fields = ("label", "key", "category__name")


@admin.register(BusinessProduct)
class BusinessProductAdmin(admin.ModelAdmin):
    list_display = ("name", "business", "category", "brand", "price", "available", "active")
    list_filter = ("category", "available", "active")
    search_fields = ("name", "brand", "business__name")


@admin.register(BusinessService)
class BusinessServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "business", "category", "available", "active")
    list_filter = ("category", "available", "active")
    search_fields = ("name", "business__name")
