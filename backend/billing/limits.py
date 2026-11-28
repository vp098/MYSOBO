"""What each plan allows. Stored on PlanPrice and editable by super admins."""

DEFAULT_LIMITS = {
    "free": {"max_photos": 3, "max_active_offers": 1},
    "pro": {"max_photos": 20, "max_active_offers": 5},
    "premium": {"max_photos": 100, "max_active_offers": 20},
}


def _limit(plan, field):
    from .models import PlanPrice

    row = PlanPrice.objects.filter(plan=plan).only(field).first()
    if row is not None:
        return getattr(row, field)
    return DEFAULT_LIMITS.get(plan, DEFAULT_LIMITS["free"])[field]


def photo_limit(plan):
    return _limit(plan, "max_photos")


def active_offer_limit(plan):
    return _limit(plan, "max_active_offers")
