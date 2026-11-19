from django.db import migrations, models
from django.db.models import Q
from django.utils import timezone


def invalidate_existing_challenges(apps, schema_editor):
    challenge = apps.get_model("accounts", "OTPChallenge")
    challenge.objects.filter(consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_otpchallenge"),
    ]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="consent_version",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="otpchallenge",
            name="consent_version",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.RunPython(
            invalidate_existing_challenges,
            migrations.RunPython.noop,
        ),
        migrations.AddConstraint(
            model_name="otpchallenge",
            constraint=models.UniqueConstraint(
                condition=Q(consumed_at__isnull=True),
                fields=("mobile",),
                name="one_active_otp_per_mobile",
            ),
        ),
    ]
