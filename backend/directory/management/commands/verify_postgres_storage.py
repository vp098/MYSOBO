import ipaddress
import json
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.utils import timezone

from accounts.models import Profile, User
from directory.models import Business, Category, Event


FIXTURE_SLUG = "mysobo-postgres-storage-check"


class Command(BaseCommand):
    help = "Create or verify local PostgreSQL test rows and read them through SQL and HTTP API."

    def add_arguments(self, parser):
        parser.add_argument("--verify-only", action="store_true")
        parser.add_argument("--api-url", default="http://127.0.0.1:8000")

    def handle(self, *args, **options):
        self._require_local_development_database()
        self._require_local_api(options["api_url"])

        username = "mysobo-postgres-storage-check"
        category_slug = f"{FIXTURE_SLUG}-category"
        if not options["verify_only"]:
            user, _ = User.objects.get_or_create(username=username)
            Profile.objects.get_or_create(
                id=user,
                defaults={"name": "PostgreSQL storage check"},
            )
            category, _ = Category.objects.get_or_create(
                slug=category_slug,
                defaults={"name": "PostgreSQL storage check"},
            )
            business, _ = Business.objects.get_or_create(
                slug=FIXTURE_SLUG,
                defaults={
                    "name": "PostgreSQL Storage Check",
                    "kind": Business.Kind.SERVICE,
                    "category": category,
                    "source": "field_agent",
                    "hidden": False,
                },
            )
            Event.objects.get_or_create(
                business=business,
                user=user,
                type="storage_check",
            )

        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id::text, username FROM accounts_user WHERE username = %s",
                [username],
            )
            user_row = cursor.fetchone()
            if not user_row:
                raise CommandError("The verification user was not found in PostgreSQL.")
            cursor.execute(
                "SELECT id_id::text, name, created_at FROM accounts_profile WHERE id_id = %s",
                [user_row[0]],
            )
            profile_row = cursor.fetchone()
            cursor.execute(
                "SELECT COUNT(*) FROM directory_business WHERE slug = %s",
                [FIXTURE_SLUG],
            )
            business_count = cursor.fetchone()[0]
            cursor.execute(
                "SELECT type, COUNT(*) FROM directory_event "
                "WHERE business_id = (SELECT id FROM directory_business WHERE slug = %s) "
                "GROUP BY type ORDER BY type",
                [FIXTURE_SLUG],
            )
            event_rows = cursor.fetchall()

        if not profile_row or business_count != 1 or not event_rows:
            raise CommandError("One or more PostgreSQL verification rows are missing.")

        self.stdout.write(f"SQL user: {user_row!r}")
        self.stdout.write(f"SQL profile: {profile_row!r}")
        self.stdout.write(f"SQL businesses for fixture: {business_count}")
        self.stdout.write(f"SQL events by type: {event_rows!r}")

        api_url = options["api_url"].rstrip("/") + f"/api/businesses/{FIXTURE_SLUG}/"
        try:
            with urlopen(api_url, timeout=5) as response:
                payload = json.loads(response.read())
                self.stdout.write(f"HTTP API status: {response.status}")
                self.stdout.write(f"HTTP API business id: {payload.get('id')}")
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise CommandError(
                "Could not verify the listing through the local HTTP API. "
                "Make sure the Django development server is running."
            ) from error

        self.stdout.write(
            self.style.SUCCESS(
                f"PostgreSQL rows verified at {timezone.now().isoformat()}."
            )
        )

    @staticmethod
    def _is_loopback(host):
        if host == "localhost":
            return True
        try:
            return ipaddress.ip_address(host).is_loopback
        except ValueError:
            return False

    def _require_local_development_database(self):
        host = connection.settings_dict.get("HOST") or ""
        if (
            not settings.DEBUG
            or connection.vendor != "postgresql"
            or not self._is_loopback(host)
        ):
            raise CommandError(
                "This command writes only to a DEBUG-mode PostgreSQL database on "
                "localhost or a loopback IP. No rows were written."
            )

    def _require_local_api(self, api_url):
        parsed = urlparse(api_url)
        if parsed.scheme != "http" or not self._is_loopback(parsed.hostname or ""):
            raise CommandError(
                "--api-url must use HTTP on localhost or a loopback IP."
            )
