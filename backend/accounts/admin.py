from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import AdminRole, Profile, Society, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = DjangoUserAdmin.list_display + ("mobile",)
    fieldsets = DjangoUserAdmin.fieldsets + (("MySobo", {"fields": ("mobile",)}),)
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (("MySobo", {"fields": ("mobile",)}),)


@admin.register(AdminRole)
class AdminRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "created_by", "created_at")
    list_filter = ("role",)
    search_fields = ("user__username",)


admin.site.register(Profile)
admin.site.register(Society)
