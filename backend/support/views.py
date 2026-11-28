from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from directory.models import AuditLog, Business
from directory.permissions import IsSuperAdmin, is_super_admin

from .models import Ticket, TicketEvent

OPEN_STATES = (Ticket.Status.OPEN, Ticket.Status.IN_PROGRESS, Ticket.Status.WAITING)
MAX_OPEN_TICKETS = 10


def _name(user):
    if user is None:
        return ""
    return user.get_full_name().strip() or user.email or user.username


def ticket_row(ticket, with_events=False, for_staff=False):
    row = {
        "id": str(ticket.id),
        "code": ticket.code,
        "subject": ticket.subject,
        "description": ticket.description,
        "category": ticket.category,
        "plan": ticket.plan,
        "status": ticket.status,
        "business": ticket.business.name if ticket.business_id else "",
        "business_id": str(ticket.business_id) if ticket.business_id else None,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "resolved_at": ticket.resolved_at,
    }
    if for_staff:
        row["user"] = _name(ticket.user)
        row["user_email"] = ticket.user.email
    if with_events:
        row["events"] = [{
            "id": str(event.id),
            "kind": event.kind,
            "body": event.body,
            "staff": event.staff,
            # Residents and owners see "MySobo team", not which admin answered.
            "author": (_name(event.author) if for_staff else "MySobo team") if event.staff else _name(event.author),
            "from_status": event.from_status,
            "to_status": event.to_status,
            "created_at": event.created_at,
        } for event in ticket.events.select_related("author")]
    return row


def _clean(value, limit):
    return " ".join(str(value or "").split())[:limit] if limit <= 150 else str(value or "").strip()[:limit]


def _set_status(ticket, new_status, actor, staff):
    if new_status == ticket.status:
        return
    TicketEvent.objects.create(ticket=ticket, author=actor, staff=staff, kind=TicketEvent.Kind.STATUS,
                               from_status=ticket.status, to_status=new_status)
    ticket.status = new_status
    ticket.resolved_at = timezone.now() if new_status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED) else None


class TicketsView(APIView):
    """Your support tickets. POST {plan, category, subject, description, business_id?} opens one."""

    permission_classes = (permissions.IsAuthenticated,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "support"

    def get_throttles(self):
        return super().get_throttles() if self.request.method == "POST" else []

    def get(self, request):
        tickets = Ticket.objects.filter(user=request.user).select_related("business").order_by("-updated_at")
        return Response([ticket_row(ticket) for ticket in tickets])

    def post(self, request):
        plan = request.data.get("plan")
        category = request.data.get("category")
        subject = _clean(request.data.get("subject"), 150)
        description = _clean(request.data.get("description"), 4000)
        if plan not in Ticket.Plan.values:
            return Response({"detail": "Tell us which plan you are using.", "field": "plan"}, status=status.HTTP_400_BAD_REQUEST)
        if category not in Ticket.Category.values:
            return Response({"detail": "Choose what you need help with.", "field": "category"}, status=status.HTTP_400_BAD_REQUEST)
        if len(subject) < 4:
            return Response({"detail": "Add a short subject.", "field": "subject"}, status=status.HTTP_400_BAD_REQUEST)
        if len(description) < 10:
            return Response({"detail": "Describe the problem in a few words.", "field": "description"}, status=status.HTTP_400_BAD_REQUEST)
        business = None
        if request.data.get("business_id"):
            business = Business.objects.filter(id=request.data["business_id"], members__user=request.user).first()
            if business is None:
                return Response({"detail": "Choose one of your own listings.", "field": "business_id"}, status=status.HTTP_400_BAD_REQUEST)
        if Ticket.objects.filter(user=request.user, status__in=OPEN_STATES).count() >= MAX_OPEN_TICKETS:
            return Response({"detail": "You have many open tickets. Please reply on one of them instead.", "code": "too_many"},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        ticket = None
        for _ in range(3):  # the unique number guards against two tickets taking the same number
            try:
                with transaction.atomic():
                    last = Ticket.objects.select_for_update().order_by("-number").first()
                    ticket = Ticket.objects.create(
                        number=(last.number if last else 0) + 1, user=request.user, business=business,
                        plan=plan, category=category, subject=subject, description=description,
                    )
                break
            except IntegrityError:
                continue
        if ticket is None:
            return Response({"detail": "Please try again."}, status=status.HTTP_409_CONFLICT)
        return Response(ticket_row(ticket, with_events=True), status=status.HTTP_201_CREATED)


class TicketDetailView(APIView):
    """One ticket with its history. The person who opened it, or a super admin."""

    permission_classes = (permissions.IsAuthenticated,)

    def _ticket(self, request, ticket_id):
        ticket = get_object_or_404(Ticket.objects.select_related("business", "user"), id=ticket_id)
        if ticket.user_id != request.user.id and not is_super_admin(request.user):
            return None
        return ticket

    def get(self, request, ticket_id):
        ticket = self._ticket(request, ticket_id)
        if ticket is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ticket_row(ticket, with_events=True, for_staff=is_super_admin(request.user)))


class TicketReplyView(APIView):
    """The ticket owner replies ({body}) or closes it ({close: true}). A reply reopens a resolved ticket."""

    permission_classes = (permissions.IsAuthenticated,)

    @transaction.atomic
    def post(self, request, ticket_id):
        ticket = get_object_or_404(Ticket.objects.select_for_update(), id=ticket_id, user=request.user)
        body = _clean(request.data.get("body"), 4000)
        if request.data.get("close") is True:
            _set_status(ticket, Ticket.Status.CLOSED, request.user, staff=False)
        elif not body:
            return Response({"detail": "Write a message first."}, status=status.HTTP_400_BAD_REQUEST)
        elif ticket.status == Ticket.Status.CLOSED:
            return Response({"detail": "This ticket is closed. Please open a new one."}, status=status.HTTP_409_CONFLICT)
        if body:
            TicketEvent.objects.create(ticket=ticket, author=request.user, staff=False, body=body)
            if ticket.status in (Ticket.Status.WAITING, Ticket.Status.RESOLVED):
                _set_status(ticket, Ticket.Status.OPEN, request.user, staff=False)
        ticket.save()
        return Response(ticket_row(ticket, with_events=True))


class AdminTicketsView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        tickets = Ticket.objects.select_related("business", "user")
        wanted = request.query_params.get("status")
        if wanted == "active":
            tickets = tickets.filter(status__in=OPEN_STATES)
        elif wanted in Ticket.Status.values:
            tickets = tickets.filter(status=wanted)
        return Response([ticket_row(ticket, for_staff=True) for ticket in tickets.order_by("-updated_at")[:300]])


class AdminTicketActionView(APIView):
    """Reply as the MySobo team and/or change the status. Body: {body?, status?}."""

    permission_classes = (IsSuperAdmin,)

    @transaction.atomic
    def post(self, request, ticket_id):
        ticket = get_object_or_404(Ticket.objects.select_for_update().select_related("user", "business"), id=ticket_id)
        body = _clean(request.data.get("body"), 4000)
        new_status = request.data.get("status")
        if new_status is not None and new_status not in Ticket.Status.values:
            return Response({"detail": "Choose a valid status."}, status=status.HTTP_400_BAD_REQUEST)
        if not body and not new_status:
            return Response({"detail": "Write a reply or choose a status."}, status=status.HTTP_400_BAD_REQUEST)
        if body:
            TicketEvent.objects.create(ticket=ticket, author=request.user, staff=True, body=body)
            if not new_status and ticket.status == Ticket.Status.OPEN:
                new_status = Ticket.Status.WAITING
        if new_status:
            _set_status(ticket, new_status, request.user, staff=True)
        ticket.save()
        AuditLog.objects.create(actor=request.user, action="ticket_updated", target_type="Ticket", target_id=str(ticket.id),
                                after={"ticket": ticket.code, "status": ticket.status, "replied": bool(body)})
        return Response(ticket_row(ticket, with_events=True, for_staff=True))
