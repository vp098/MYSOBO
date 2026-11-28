from django.core.management.base import BaseCommand, CommandError

from accounts.models import AdminRole, User


class Command(BaseCommand):
    help = "Give an existing account (by email) the Super Admin role. Run on the server only."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, email, **options):
        user = User.objects.filter(email__iexact=email.strip()).order_by("date_joined").first()
        if user is None:
            raise CommandError("No account with that email. Sign in with Google once first, then run this again.")
        _, created = AdminRole.objects.get_or_create(user=user, role=AdminRole.Role.SUPER_ADMIN)
        self.stdout.write(f"{email}: {'is now' if created else 'was already'} a Super Admin")
