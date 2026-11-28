from django.db import migrations

# The confirmed launch prices (rupees per month, before 18% GST). Only rows that
# do not exist yet are added; prices an admin already set are never changed.
PRICES = {"free": 0, "pro": 499, "premium": 1999}


def add_missing_prices(apps, schema_editor):
    PlanPrice = apps.get_model("billing", "PlanPrice")
    for plan, price in PRICES.items():
        PlanPrice.objects.get_or_create(plan=plan, defaults={"monthly_price": price, "active": True})


class Migration(migrations.Migration):
    dependencies = [("billing", "0003_one_pending_plan_request")]
    operations = [migrations.RunPython(add_missing_prices, migrations.RunPython.noop)]
