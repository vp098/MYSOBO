import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    """Adds when a business was saved. Existing rows stay empty instead of getting a made-up date."""

    dependencies = [("directory", "0013_plan_c_fields")]

    operations = [
        migrations.AddField(
            model_name="savedbusiness", name="created_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="savedbusiness", name="created_at",
            field=models.DateTimeField(blank=True, null=True, default=django.utils.timezone.now),
        ),
    ]
