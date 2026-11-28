import hmac

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from directory.permissions import IsSuperAdmin, is_super_admin

from .models import Invoice
from .pdf import invoice_pdf
from .services import BillingError, record_payment, run_billing


def invoice_row(invoice):
    return {
        "id": str(invoice.id),
        "number": invoice.number,
        "business_id": str(invoice.business_id),
        "business": invoice.business_name,
        "plan": invoice.plan,
        "period_start": invoice.period_start,
        "period_end": invoice.period_end,
        "issued_on": invoice.issued_on,
        "due_on": invoice.due_on,
        "amount_paise": invoice.amount_paise,
        "gst_percent": invoice.gst_percent,
        "gst_paise": invoice.gst_paise,
        "total_paise": invoice.total_paise,
        "status": invoice.status,
        "paid_on": invoice.paid_on,
        "method": invoice.payment.method if invoice.payment_id else "",
        "pdf_url": f"/api/invoices/{invoice.id}/pdf/",
    }


class OwnerInvoicesView(APIView):
    """Invoices for the businesses you own or manage."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        invoices = Invoice.objects.filter(business__members__user=request.user).select_related("payment").distinct()
        return Response([invoice_row(invoice) for invoice in invoices.order_by("-issued_on", "-seq")])


class InvoicePdfView(APIView):
    """Download an invoice as a PDF: the business's members and super admins only."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request, invoice_id):
        invoice = get_object_or_404(Invoice.objects.select_related("payment"), id=invoice_id)
        allowed = is_super_admin(request.user) or invoice.business.members.filter(user=request.user).exists()
        if not allowed:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        data = None
        # A stored copy is only reused for paid invoices; open ones are rebuilt so the status is current.
        if invoice.pdf_path and invoice.status == Invoice.Status.PAID:
            try:
                with default_storage.open(invoice.pdf_path, "rb") as handle:
                    data = handle.read()
            except Exception:
                data = None
        data = data or invoice_pdf(invoice)
        response = HttpResponse(data, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{invoice.number}.pdf"'
        return response


class AdminInvoicesView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        invoices = Invoice.objects.select_related("payment")
        wanted = request.query_params.get("status")
        if wanted in Invoice.Status.values:
            invoices = invoices.filter(status=wanted)
        return Response([invoice_row(invoice) for invoice in invoices.order_by("-issued_on", "-seq")[:300]])


class AdminInvoicePayView(APIView):
    """Record a UPI or cash payment for an invoice. Body: {method: "upi"|"cash", reference}."""

    permission_classes = (IsSuperAdmin,)

    def post(self, request, invoice_id):
        try:
            invoice = record_payment(invoice_id, request.data.get("method"), request.data.get("reference", ""), request.user)
        except BillingError as error:
            code = {"not_found": 404, "already_paid": 409, "conflict": 409, "cancelled": 409}.get(error.code, 400)
            return Response({"detail": str(error), "code": error.code}, status=code)
        return Response(invoice_row(invoice))


class BillingCronView(APIView):
    """Daily billing job for Vercel Cron. Needs Authorization: Bearer <CRON_SECRET>."""

    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)
    throttle_classes = ()

    def _run(self, request):
        secret = getattr(settings, "CRON_SECRET", "")
        if not secret:
            return Response({"detail": "Billing cron is not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        sent = request.headers.get("Authorization", "")
        if not hmac.compare_digest(sent.encode(), f"Bearer {secret}".encode()):
            return Response({"detail": "Not allowed."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(run_billing())

    def get(self, request):
        return self._run(request)

    def post(self, request):
        return self._run(request)
