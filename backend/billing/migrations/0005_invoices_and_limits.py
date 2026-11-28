import uuid

import django.db.models.deletion
from django.db import migrations, models

LIMITS = {"free": (3, 1), "pro": (20, 5), "premium": (100, 20)}


def set_limits(apps, schema_editor):
    PlanPrice = apps.get_model("billing", "PlanPrice")
    for plan, (photos, offers) in LIMITS.items():
        PlanPrice.objects.filter(plan=plan).update(max_photos=photos, max_active_offers=offers)


class Migration(migrations.Migration):
    """Plan limits on PlanPrice, and invoices that exist before payment.

    The old Invoice table required a Payment and had no rows in production,
    so it is replaced rather than altered.
    """

    dependencies = [
        ("billing", "0004_default_plan_prices"),
        ("directory", "0013_plan_c_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="planprice", name="max_photos",
            field=models.PositiveIntegerField(default=3, db_default=3),
        ),
        migrations.AddField(
            model_name="planprice", name="max_active_offers",
            field=models.PositiveIntegerField(default=1, db_default=1),
        ),
        migrations.RunPython(set_limits, migrations.RunPython.noop),
        migrations.DeleteModel(name="Invoice"),
        migrations.CreateModel(
            name="Invoice",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("seq", models.PositiveIntegerField(unique=True)),
                ("number", models.CharField(max_length=40, unique=True)),
                ("plan", models.CharField(choices=[("free", "Free"), ("pro", "Pro"), ("premium", "Premium")], max_length=10)),
                ("period_start", models.DateField()),
                ("period_end", models.DateField()),
                ("issued_on", models.DateField()),
                ("due_on", models.DateField()),
                ("amount_paise", models.BigIntegerField()),
                ("gst_percent", models.PositiveSmallIntegerField(default=18)),
                ("gst_paise", models.BigIntegerField()),
                ("total_paise", models.BigIntegerField()),
                ("status", models.CharField(choices=[("pending", "Pending"), ("paid", "Paid"), ("overdue", "Overdue"), ("cancelled", "Cancelled")], default="pending", max_length=10)),
                ("business_name", models.CharField(max_length=200)),
                ("business_address", models.TextField(blank=True)),
                ("business_phone", models.CharField(blank=True, max_length=15)),
                ("business_email", models.EmailField(blank=True, max_length=254)),
                ("business_gst", models.CharField(blank=True, max_length=15)),
                ("paid_on", models.DateTimeField(blank=True, null=True)),
                ("pdf_path", models.CharField(blank=True, max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("business", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="invoices", to="directory.business")),
                ("payment", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="invoice", to="billing.payment")),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        condition=~models.Q(status="cancelled"),
                        fields=("business", "period_start"),
                        name="one_open_invoice_per_business_period",
                    ),
                ],
                "indexes": [models.Index(fields=["status", "due_on"], name="invoice_status_due_idx")],
            },
        ),
    ]
