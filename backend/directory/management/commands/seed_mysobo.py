from django.core.management.base import BaseCommand
from django.utils.text import slugify

from billing.models import AppSetting, PlanPrice
from directory.models import Category


class Command(BaseCommand):
    help = "Seed MySobo launch categories and default settings"

    def handle(self, *args, **options):
        names = [
            "Medical and health", "Tuition and coaching", "House help", "Schools",
            "Academies", "Daycare and elder care", "Home services",
            "Shopping and daily needs", "Food and dining", "Property",
            "Used cars and vehicles", "Weddings and events", "Transport and travel",
            "Jobs and coworking", "Professional services", "Fitness and wellness",
            "Civic essentials", "Influencers and creators",
        ]
        for priority, name in enumerate(names, start=1):
            Category.objects.update_or_create(
                slug=slugify(name),
                defaults={"name": name, "priority": priority},
            )
        PlanPrice.objects.update_or_create(plan="pro", defaults={"monthly_price": 499, "active": True})
        PlanPrice.objects.update_or_create(plan="premium", defaults={"monthly_price": 1999, "active": True})
        PlanPrice.objects.update_or_create(plan="free", defaults={"monthly_price": 0, "active": True})
        AppSetting.objects.update_or_create(key="grace_days", defaults={"value": {"days": 7}})
        AppSetting.objects.update_or_create(key="free_pro_cap", defaults={"value": {"count": 100}})
        AppSetting.objects.update_or_create(key="claim_sla_hours", defaults={"value": {"hours": 48}})
        self.stdout.write(self.style.SUCCESS("Seeded MySobo launch data"))
