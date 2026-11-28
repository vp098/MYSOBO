"""Browser sign-in uses Django sessions: an httpOnly, SameSite=Lax cookie that
lasts 30 days and is renewed whenever the app is opened. Nothing secret is
kept in localStorage or sessionStorage. Signing out ends the session only;
the account and everything linked to it stays.
"""
from django.conf import settings
from django.contrib.auth import login, logout
from rest_framework.response import Response

from .models import AdminRole, Profile

SUPER_ADMIN_HOME = "/sobo/admin"
OWNER_HOME = "/sobo/business-owner"
RESIDENT_HOME = "/sobo/resident"


def is_super_admin(user):
    return user.is_authenticated and (
        user.is_superuser or user.admin_roles.filter(role=AdminRole.Role.SUPER_ADMIN).exists()
    )


def home_for(user):
    """The dashboard a signed-in person should land on."""
    if is_super_admin(user):
        return SUPER_ADMIN_HOME
    profile = Profile.objects.filter(id=user).only("account_type").first()
    from directory.models import BusinessMember  # local import: directory depends on accounts

    if (profile and profile.account_type == Profile.AccountType.BUSINESS_OWNER) or BusinessMember.objects.filter(user=user).exists():
        return OWNER_HOME
    return RESIDENT_HOME


def _django_request(request):
    return getattr(request, "_request", request)


def signed_in(request, user, status_code=200):
    """Start (or rotate) the session cookie and tell the app where to go."""
    django_request = _django_request(request)
    login(django_request, user, backend="django.contrib.auth.backends.ModelBackend")
    django_request.session.set_expiry(settings.SESSION_COOKIE_AGE)
    return Response({"ok": True, "home": home_for(user)}, status=status_code)


def refresh_session(request):
    """Slide the 30-day window forward when the person comes back."""
    django_request = _django_request(request)
    if django_request.session.session_key:
        django_request.session.set_expiry(settings.SESSION_COOKIE_AGE)


def sign_out(request):
    logout(_django_request(request))
