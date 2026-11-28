from django.core.management.base import BaseCommand

from billing.services import run_billing


class Command(BaseCommand):
    help = "Create renewal invoices, mark overdue invoices and end unpaid plans after the grace period. Safe to re-run."

    def handle(self, *args, **options):
        summary = run_billing()
        self.stdout.write(f"created={summary['created']} overdue={summary['overdue']} expired={summary['expired']}")
