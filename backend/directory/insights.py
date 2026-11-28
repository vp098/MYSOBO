"""Phase F: admin overview (real numbers only), user list, offers feed, resident activity and profile."""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AdminRole, Profile
from billing.models import Invoice, SubscriptionRequest
from support.models import Ticket

from .models import AuditLog, Business, BusinessPost, Category, Claim, Event, Report, Review, SavedBusiness, Subcategory
from .permissions import IsSuperAdmin
from .serializers import active_offers

User = get_user_model()


def _name(user):
    if user is None:
        return ""
    return user.get_full_name().strip() or user.email or user.username


class AdminOverviewView(APIView):
    """Ten panels for the admin home. Every number is counted from the database on request."""

    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        now = timezone.now()
        today = timezone.localdate()
        week, month = now - timedelta(days=7), now - timedelta(days=30)
        alive = Business.objects.filter(deleted_at__isnull=True)
        live = alive.filter(hidden=False)
        waiting = alive.filter(hidden=True, approval_requested_at__isnull=False)
        oldest = waiting.order_by("approval_requested_at").values_list("approval_requested_at", flat=True).first()

        admins = AdminRole.objects.values_list("user_id", flat=True).distinct()
        owners = User.objects.filter(
            Q(profile__account_type=Profile.AccountType.BUSINESS_OWNER) | Q(businessmember__isnull=False)
        ).exclude(id__in=admins).distinct()

        top = Category.objects.annotate(
            live=Count("business", filter=Q(business__hidden=False, business__deleted_at__isnull=True))
        ).filter(live__gt=0).order_by("-live", "name")[:5]

        posts = BusinessPost.objects.all()
        offers_live = active_offers(posts.filter(business__hidden=False, business__deleted_at__isnull=True)).count()
        month_start = today.replace(day=1)
        paid = Invoice.objects.filter(status=Invoice.Status.PAID)
        open_invoices = Invoice.objects.filter(status__in=(Invoice.Status.PENDING, Invoice.Status.OVERDUE))
        overdue = Invoice.objects.filter(status=Invoice.Status.OVERDUE)
        events = Event.objects.filter(created_at__gte=month)
        tickets = Ticket.objects.all()

        return Response({
            "generated_at": now,
            "businesses": {
                "total": alive.count(), "live": live.count(), "hidden": alive.filter(hidden=True).count(),
                "verified": live.filter(verification_level__gte=2).count(), "new_7d": alive.filter(created_at__gte=week).count(),
                "service": alive.filter(kind="service").count(), "product": alive.filter(kind="product").count(),
                "both": alive.filter(kind="both").count(),
            },
            "verification": {
                "waiting": waiting.count(),
                "listing_requests": Claim.objects.filter(status=Claim.Status.PENDING).count(),
                "changes_requested": alive.filter(hidden=True, approval_requested_at__isnull=True).exclude(verification_note="").count(),
                "oldest_waiting_hours": int((now - oldest).total_seconds() // 3600) if oldest else None,
            },
            "users": {
                "total": User.objects.count(),
                "owners": owners.count(),
                "residents": User.objects.exclude(id__in=owners.values("id")).exclude(id__in=admins).count(),
                "admins": len(set(admins)),
                "new_7d": User.objects.filter(date_joined__gte=week).count(),
                "new_30d": User.objects.filter(date_joined__gte=month).count(),
            },
            "categories": {
                "categories": Category.objects.count(), "active": Category.objects.filter(active=True).count(),
                "subcategories": Subcategory.objects.count(),
                "in_use": Category.objects.filter(business__hidden=False, business__deleted_at__isnull=True).distinct().count(),
                "top": [{"name": item.name, "live": item.live} for item in top],
            },
            "offers": {
                "live": offers_live,
                "pending": posts.filter(status=BusinessPost.Status.PENDING).count(),
                "expired": posts.filter(expires_on__lt=today).count(),
                "rejected": posts.filter(status=BusinessPost.Status.REJECTED).count(),
            },
            "plans": {
                "free": alive.filter(plan="free").count(), "pro": alive.filter(plan="pro").count(),
                "premium": alive.filter(plan="premium").count(),
                "pending_requests": SubscriptionRequest.objects.filter(status=SubscriptionRequest.Status.PENDING).count(),
                "ending_7d": alive.filter(plan__in=("pro", "premium"), plan_expires_on__lte=now + timedelta(days=7)).count(),
            },
            "billing": {
                "paid_this_month_paise": paid.filter(paid_on__date__gte=month_start).aggregate(total=Sum("total_paise"))["total"] or 0,
                "paid_all_time_paise": paid.aggregate(total=Sum("total_paise"))["total"] or 0,
                "outstanding_paise": open_invoices.aggregate(total=Sum("total_paise"))["total"] or 0,
                "outstanding": open_invoices.count(),
                "overdue": overdue.count(),
                "overdue_paise": overdue.aggregate(total=Sum("total_paise"))["total"] or 0,
            },
            "support": {
                "open": tickets.filter(status=Ticket.Status.OPEN).count(),
                "in_progress": tickets.filter(status=Ticket.Status.IN_PROGRESS).count(),
                "waiting": tickets.filter(status=Ticket.Status.WAITING).count(),
                "resolved_7d": tickets.filter(resolved_at__gte=week).count(),
                "total": tickets.count(),
            },
            "engagement": {
                "views_30d": events.filter(type="view").count(),
                "calls_30d": events.filter(type="call").count(),
                "whatsapp_30d": events.filter(type="whatsapp").count(),
                "saves_30d": SavedBusiness.objects.filter(created_at__gte=month).count(),
                "reviews_30d": Review.objects.filter(created_at__gte=month).count(),
            },
            "reports": {
                "open": Report.objects.filter(status="open").count(),
                "resolved": Report.objects.exclude(status="open").count(),
                "recent_admin_actions": [
                    {"actor": _name(row.actor), "action": row.action, "at": row.created_at}
                    for row in AuditLog.objects.select_related("actor").order_by("-created_at")[:5]
                ],
            },
        })


class AdminUsersView(APIView):
    """Read-only list of people. ?q= searches name, email and mobile; ?type=resident|business_owner|admin."""

    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        users = User.objects.select_related("profile").annotate(
            businesses=Count("businessmember", filter=Q(businessmember__business__deleted_at__isnull=True), distinct=True),
            tickets_open=Count("tickets", filter=Q(tickets__status__in=("open", "in_progress", "waiting")), distinct=True),
        )
        admins = set(AdminRole.objects.values_list("user_id", flat=True))
        query = (request.query_params.get("q") or "").strip()
        if query:
            users = users.filter(Q(first_name__icontains=query) | Q(last_name__icontains=query) | Q(email__icontains=query)
                                 | Q(mobile__icontains=query) | Q(profile__name__icontains=query))
        kind = request.query_params.get("type")
        if kind == "admin":
            users = users.filter(id__in=admins)
        elif kind == "business_owner":
            users = users.filter(Q(profile__account_type=kind) | Q(businesses__gt=0)).exclude(id__in=admins)
        elif kind == "resident":
            users = users.exclude(profile__account_type="business_owner").filter(businesses=0).exclude(id__in=admins)
        rows = []
        for user in users.order_by("-date_joined")[:200]:
            profile = getattr(user, "profile", None)
            rows.append({
                "id": str(user.id), "name": _name(user), "email": user.email, "mobile": user.mobile or "",
                "account_type": "admin" if user.id in admins else (profile.account_type if profile else "resident"),
                "businesses": user.businesses, "tickets_open": user.tickets_open,
                "joined": user.date_joined, "last_login": user.last_login, "active": user.is_active,
            })
        return Response(rows)


class OffersFeedView(APIView):
    """Live offers on live listings, newest first. ?saved=1 limits to the signed-in person's saved businesses."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        posts = active_offers(BusinessPost.objects.filter(business__hidden=False, business__deleted_at__isnull=True)).select_related(
            "business", "business__category"
        )
        if request.query_params.get("saved") and request.user.is_authenticated:
            posts = posts.filter(business__savedbusiness__user=request.user)
        kind = request.query_params.get("kind")
        if kind in ("service", "product"):
            posts = posts.filter(business__kind__in=(kind, "both"))
        return Response([{
            "id": str(post.id), "title": post.title, "body": post.body,
            "starts_on": post.starts_on, "expires_on": post.expires_on,
            "business": {"name": post.business.name, "slug": post.business.slug, "kind": post.business.kind,
                         "category": post.business.category.name if post.business.category_id else ""},
        } for post in posts[:60]])


class MyActivityView(APIView):
    """What you did recently: saves, reviews, calls/WhatsApp, support requests. Newest first."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        user = request.user
        items = []
        for row in SavedBusiness.objects.filter(user=user, created_at__isnull=False).select_related("business")[:50]:
            items.append({"type": "saved", "at": row.created_at, "title": row.business.name, "slug": row.business.slug})
        for row in Review.objects.filter(user=user).select_related("business").order_by("-created_at")[:50]:
            items.append({"type": "review", "at": row.created_at, "title": row.business.name, "slug": row.business.slug, "rating": row.rating})
        for row in Event.objects.filter(user=user, type__in=("call", "whatsapp")).select_related("business").order_by("-created_at")[:50]:
            if row.business_id:
                items.append({"type": row.type, "at": row.created_at, "title": row.business.name, "slug": row.business.slug})
        for row in Ticket.objects.filter(user=user).order_by("-created_at")[:50]:
            items.append({"type": "ticket", "at": row.created_at, "title": row.subject, "code": row.code, "status": row.status})
        items.sort(key=lambda item: item["at"], reverse=True)
        return Response(items[:60])


class MyProfileView(APIView):
    """Your name (PATCH {name}). Email and mobile change through their own sign-in flows."""

    permission_classes = (permissions.IsAuthenticated,)

    def patch(self, request):
        name = " ".join(str(request.data.get("name", "")).split())[:150]
        if len(name) < 2:
            return Response({"detail": "Enter your name.", "field": "name"}, status=status.HTTP_400_BAD_REQUEST)
        first, _, last = name.partition(" ")
        user = request.user
        user.first_name, user.last_name = first[:150], last[:150]
        user.save(update_fields=["first_name", "last_name"])
        Profile.objects.update_or_create(id=user, defaults={"name": name})
        return Response({"name": name})
