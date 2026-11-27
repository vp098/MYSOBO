from django.conf import settings
from django.db import connection, transaction


class PostgreSQLRLSContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if connection.vendor != "postgresql":
            return self.get_response(request)

        user_id = self._get_authenticated_user_id(request)
        with transaction.atomic():
            with connection.cursor() as cursor:
                # All three settings are transaction-local, so they never leak
                # to another request through the connection pooler.
                cursor.execute(
                    "SELECT set_config('mysobo.user_id', %s, true), "
                    "set_config('statement_timeout', %s, true), "
                    "set_config('lock_timeout', %s, true)",
                    [
                        str(user_id) if user_id else "",
                        str(getattr(settings, "DB_STATEMENT_TIMEOUT_MS", 5000)),
                        str(getattr(settings, "DB_LOCK_TIMEOUT_MS", 3000)),
                    ],
                )
            return self.get_response(request)

    @staticmethod
    def _get_authenticated_user_id(request):
        session_user = getattr(request, "user", None)
        if session_user and session_user.is_authenticated:
            return session_user.pk

        authorization = request.headers.get("Authorization", "")
        scheme, separator, token_key = authorization.partition(" ")
        if not separator or scheme.lower() != "token" or not token_key:
            return None

        from rest_framework.authtoken.models import Token

        return Token.objects.filter(key=token_key.strip()).values_list("user_id", flat=True).first()
