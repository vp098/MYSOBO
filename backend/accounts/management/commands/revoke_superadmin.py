from django.core.management.base import BaseCommand, CommandError

from accounts.models import AdminRole, User


class Command(BaseCommand):
    help = "Remove the Super Admin role from an account (by email). Run on the server only."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, email, **options):
        user = User.objects.filter(email__iexact=email.strip()).first()
        if user is None:
            raise CommandError("No account with that email.")
        removed, _ = AdminRole.objects.filter(user=user, role=AdminRole.Role.SUPER_ADMIN).delete()
        self.stdout.write(f"{email}: {'Super Admin removed' if removed else 'was not a Super Admin'}")
