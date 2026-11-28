"""Monthly billing: invoices with 18% GST on top, manual (UPI or cash) payments.

Rules (confirmed by the owner of MySobo):
- Paid features unlock only after an admin records the payment.
- An unpaid invoice is never marked paid by the system.
- run_billing() is safe to run any number of times a day.
"""
import calendar
import uuid
from datetime import date, datetime, time, timedelta

from django.db import transaction
from django.utils import timezone

from directory.models import AuditLog, Business

from .models import GST_PERCENT, AppSetting, Invoice, Payment, PlanPrice, Subscription

PAID_PLANS = ("pro", "premium")
PAYMENT_METHODS = ("upi", "cash")
RENEW_DAYS_BEFORE = 7


class BillingError(Exception):
    def __init__(self, message, code="invalid"):
        super().__init__(message)
        self.code = code


def add_month(day):
    """Same day next month, clamped to the month's length (31 Jan -> 28/29 Feb)."""
    year, month = (day.year + 1, 1) if day.month == 12 else (day.year, day.month + 1)
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def grace_days():
    row = AppSetting.objects.filter(key="grace_period_days").first()
    value = row.value if row else 7
    return value if isinstance(value, int) and value >= 0 else 7


def gst_for(base_paise):
    return (base_paise * GST_PERCENT + 50) // 100


def _next_sequence():
    """Gap-free invoice sequence, locked so two invoices never share a number."""
    counter, _ = AppSetting.objects.select_for_update().get_or_create(key="invoice_sequence", defaults={"value": 0})
    value = (counter.value if isinstance(counter.value, int) else 0) + 1
    counter.value = value
    counter.save(update_fields=["value"])
    return value


def invoice_number(seq, issued_on):
    return f"MS-{issued_on.year}-{seq:05d}"


@transaction.atomic
def create_invoice(business, plan, period_start, actor=None):
    """Idempotent: returns the existing open/paid invoice for this business and period if there is one."""
    if plan not in PAID_PLANS:
        raise BillingError("Only Pro and Premium are billed.")
    existing = Invoice.objects.filter(business=business, period_start=period_start).exclude(
        status=Invoice.Status.CANCELLED
    ).first()
    if existing:
        return existing, False
    price = PlanPrice.objects.filter(plan=plan, active=True).first()
    if price is None:
        raise BillingError("That plan is not currently available.", "unavailable")
    base = price.monthly_price * 100
    gst = gst_for(base)
    today = timezone.localdate()
    seq = _next_sequence()
    invoice = Invoice.objects.create(
        seq=seq,
        number=invoice_number(seq, today),
        business=business,
        plan=plan,
        period_start=period_start,
        period_end=add_month(period_start) - timedelta(days=1),
        issued_on=today,
        due_on=max(today, period_start) + timedelta(days=grace_days()),
        amount_paise=base,
        gst_percent=GST_PERCENT,
        gst_paise=gst,
        total_paise=base + gst,
        business_name=business.name,
        business_address=business.address or "",
        business_phone=business.phone or "",
        business_email=business.email or "",
        business_gst=getattr(business, "gst_number", "") or "",
    )
    AuditLog.objects.create(
        actor=actor, action="invoice_created", target_type="Invoice", target_id=str(invoice.id),
        after={"number": invoice.number, "business": business.name, "plan": plan, "total_paise": invoice.total_paise},
    )
    store_pdf(invoice)
    return invoice, True


def store_pdf(invoice):
    """Keep a copy of the PDF in media storage. Best effort: the PDF can always be rebuilt from the invoice row."""
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    from .pdf import invoice_pdf

    try:
        path = default_storage.save(f"invoices/{invoice.number}.pdf", ContentFile(invoice_pdf(invoice)))
    except Exception:  # storage not configured or unreachable
        return None
    Invoice.objects.filter(pk=invoice.pk).update(pdf_path=path)
    invoice.pdf_path = path
    return path


def _end_of_day(day):
    return timezone.make_aware(datetime.combine(day, time(23, 59, 59)))


@transaction.atomic
def record_payment(invoice_id, method, reference, admin):
    """An admin confirms a UPI or cash payment: the invoice is paid and the plan becomes active."""
    invoice = Invoice.objects.select_for_update().select_related("business").filter(id=invoice_id).first()
    if invoice is None:
        raise BillingError("Invoice not found.", "not_found")
    if invoice.status == Invoice.Status.PAID:
        raise BillingError("This invoice is already paid.", "already_paid")
    if invoice.status == Invoice.Status.CANCELLED:
        raise BillingError("This invoice was cancelled.", "cancelled")
    if method not in PAYMENT_METHODS:
        raise BillingError("Choose UPI or cash.")
    reference = (reference or "").strip()[:200]
    if method == "upi" and not reference:
        raise BillingError("Enter the UPI transaction reference.")
    gateway_ref = f"{method}-{reference}" if reference else f"cash-{uuid.uuid4()}"
    if Payment.objects.filter(gateway_ref=gateway_ref).exists():
        raise BillingError("This payment reference was already recorded.", "conflict")

    business = Business.objects.select_for_update().get(pk=invoice.business_id)
    now = timezone.now()
    expires = _end_of_day(invoice.period_end)
    subscription = Subscription.objects.create(
        business=business, plan=invoice.plan, status=Subscription.Status.ACTIVE,
        starts_on=timezone.make_aware(datetime.combine(invoice.period_start, time.min)),
        expires_on=expires, created_by=admin,
    )
    payment = Payment.objects.create(
        subscription=subscription, amount_paise=invoice.amount_paise, gst_paise=invoice.gst_paise,
        method=method, gateway_ref=gateway_ref, status="paid", paid_on=now, recorded_by=admin,
    )
    invoice.status = Invoice.Status.PAID
    invoice.payment = payment
    invoice.paid_on = now
    invoice.save(update_fields=["status", "payment", "paid_on"])
    business.plan = invoice.plan
    if not business.plan_expires_on or business.plan_expires_on < expires:
        business.plan_expires_on = expires
    business.save(update_fields=["plan", "plan_expires_on", "updated_at"])
    AuditLog.objects.create(
        actor=admin, action="payment_recorded", target_type="Invoice", target_id=str(invoice.id),
        after={"number": invoice.number, "business": business.name, "plan": invoice.plan,
               "total_paise": invoice.total_paise, "method": method},
    )
    store_pdf(invoice)
    return invoice


def run_billing(today=None):
    """Daily job: renewal invoices, overdue marking, and ending unpaid plans after the grace period."""
    today = today or timezone.localdate()
    summary = {"created": 0, "overdue": 0, "expired": 0}

    # 1. Renewal invoices for paid plans that end within the next week.
    soon = _end_of_day(today + timedelta(days=RENEW_DAYS_BEFORE))
    renewing = Business.objects.filter(
        plan__in=PAID_PLANS, deleted_at__isnull=True, plan_expires_on__isnull=False, plan_expires_on__lte=soon,
    )
    for business in renewing:
        next_start = timezone.localdate(business.plan_expires_on) + timedelta(days=1)
        try:
            _, created = create_invoice(business, business.plan, next_start)
        except BillingError:
            continue
        summary["created"] += created

    # 2. Pending invoices past their due date.
    summary["overdue"] = Invoice.objects.filter(status=Invoice.Status.PENDING, due_on__lt=today).update(
        status=Invoice.Status.OVERDUE
    )

    # 3. Paid plans not renewed within the grace period go back to Free.
    cutoff = _end_of_day(today - timedelta(days=grace_days()))
    for business in Business.objects.filter(plan__in=PAID_PLANS, plan_expires_on__lt=cutoff):
        with transaction.atomic():
            Subscription.objects.filter(business=business, status=Subscription.Status.ACTIVE).update(
                status=Subscription.Status.EXPIRED
            )
            business.plan = Business.Plan.FREE
            business.save(update_fields=["plan", "updated_at"])
            AuditLog.objects.create(action="plan_expired", target_type="Business", target_id=str(business.id),
                                    after={"business": business.name})
            summary["expired"] += 1
    return summary
