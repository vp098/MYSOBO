from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import AdminRole


def has_admin_role(user, *roles):
    if not user or not user.is_authenticated:
        return False
    if user.admin_roles.filter(role=AdminRole.Role.SUPER_ADMIN).exists():
        return True
    return user.admin_roles.filter(role__in=roles).exists()


def is_member(user, business):
    return bool(user and user.is_authenticated and business.members.filter(user=user).exists())


class IsAdminOrMember(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if has_admin_role(request.user, AdminRole.Role.VERIFIER):
            return True
        return is_member(request.user, obj)


class IsVerifier(BasePermission):
    def has_permission(self, request, view):
        return has_admin_role(request.user, AdminRole.Role.VERIFIER)
