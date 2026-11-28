import uuid

from django.conf import settings
from django.db import models

from directory.models import Business


class Ticket(models.Model):
    """A support request. Its history is the list of TicketEvents."""

    class Plan(models.TextChoices):
        FREE = "free", "Free"
        PRO = "pro", "Pro"
        PREMIUM = "premium", "Premium"
        NOT_SURE = "not_sure", "Not sure"
        RESIDENT = "resident", "Resident (no plan)"

    class Category(models.TextChoices):
        LISTING = "listing", "Listing and approval"
        BILLING = "billing", "Plans, invoices and payments"
        ACCOUNT = "account", "Account and log-in"
        TECHNICAL = "technical", "Something is not working"
        REPORT = "report", "Report a business"
        OTHER = "other", "Something else"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In progress"
        WAITING = "waiting", "Waiting for your reply"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.PositiveIntegerField(unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tickets")
    business = models.ForeignKey(Business, null=True, blank=True, on_delete=models.SET_NULL, related_name="tickets")
    plan = models.CharField(max_length=10, choices=Plan.choices)
    category = models.CharField(max_length=12, choices=Category.choices)
    subject = models.CharField(max_length=150)
    description = models.TextField(max_length=4000)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "-updated_at"], name="ticket_status_updated_idx"),
            models.Index(fields=["user", "-updated_at"], name="ticket_user_updated_idx"),
        ]

    @property
    def code(self):
        return f"T-{self.number:05d}"


class TicketEvent(models.Model):
    """One entry in a ticket's history: a message, or a status change."""

    class Kind(models.TextChoices):
        MESSAGE = "message", "Message"
        STATUS = "status", "Status change"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="events")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    staff = models.BooleanField(default=False)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.MESSAGE)
    body = models.TextField(blank=True, max_length=4000)
    from_status = models.CharField(max_length=12, blank=True)
    to_status = models.CharField(max_length=12, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at",)
