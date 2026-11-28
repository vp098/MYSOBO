from django.conf import settings

from .models import AdminRole


def ensure_bootstrap_superadmin(user, verified_email):
    """Give the Super Admin role to a Google account listed in SUPERADMIN_EMAILS.

    Only called after Google has verified the email. Normal sign-ups never
    become admins; this list lives in server settings, never in the browser.
    """
    email = (verified_email or "").strip().lower()
    if not email or email not in getattr(settings, "SUPERADMIN_EMAILS", set()):
        return False
    _, created = AdminRole.objects.get_or_create(user=user, role=AdminRole.Role.SUPER_ADMIN)
    if created:
        from directory.models import AuditLog

        AuditLog.objects.create(actor=user, action="superadmin_bootstrapped", target_type="User", target_id=str(user.pk),
                                after={"email": email, "source": "SUPERADMIN_EMAILS"})
    return created
