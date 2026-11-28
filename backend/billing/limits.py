"""What each plan allows. Phase D makes these admin-editable in the database."""

PHOTO_LIMITS = {"free": 3, "pro": 20, "premium": 100}
# Offers that are pending or approved and not yet expired, per listing.
ACTIVE_OFFER_LIMITS = {"free": 1, "pro": 5, "premium": 20}


def photo_limit(plan):
    return PHOTO_LIMITS.get(plan, PHOTO_LIMITS["free"])


def active_offer_limit(plan):
    return ACTIVE_OFFER_LIMITS.get(plan, ACTIVE_OFFER_LIMITS["free"])
