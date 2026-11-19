from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.text import slugify

from directory.models import Business, Category


class Command(BaseCommand):
    help = "Create clearly labeled local demo service and product listings"

    def handle(self, *args, **options):
        examples = (
            {
                "name": "DEMO - Home Cleaning Service",
                "kind": Business.Kind.SERVICE,
                "category": "Home services",
                "description": "Demo listing for testing service filters and listing details. Not a real business.",
                "slug": "demo-home-cleaning-service",
            },
            {
                "name": "DEMO - Daily Essentials Shop",
                "kind": Business.Kind.PRODUCT,
                "category": "Shopping and daily needs",
                "description": "Demo listing for testing product filters and listing details. Not a real business.",
                "slug": "demo-daily-essentials-shop",
            },
        )

        for example in examples:
            category, _ = Category.objects.get_or_create(
                slug=slugify(example["category"]),
                defaults={
                    "name": example["category"],
                    "priority": 0,
                    "supports_services": True,
                    "supports_products": True,
                },
            )
            Business.objects.update_or_create(
                slug=example["slug"],
                defaults={
                    "name": example["name"],
                    "kind": example["kind"],
                    "category": category,
                    "description": example["description"],
                    "phone": "",
                    "whatsapp": "",
                    "source": "demo",
                    "verification_level": 2,
                    "verified_on": timezone.now(),
                    "hidden": False,
                },
            )

        self.stdout.write(self.style.SUCCESS("Created or updated 2 clearly labeled demo listings."))
