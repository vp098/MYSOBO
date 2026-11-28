"""
WSGI entry point. Vercel's Python runtime looks for a variable named ``app``;
Django and gunicorn use ``application``. Both point to the same callable.

If Django cannot start (usually a missing or wrong environment variable), the
site answers 503 with the configuration message instead of crashing with an
opaque FUNCTION_INVOCATION_FAILED. Only Django's own configuration messages
are shown (they name settings, never their values).
"""

import os
import sys
import traceback

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mysobo.settings")

try:
    from django.core.wsgi import get_wsgi_application

    application = get_wsgi_application()
except Exception as error:  # noqa: BLE001 - report startup problems instead of crashing
    from django.core.exceptions import ImproperlyConfigured

    traceback.print_exc(file=sys.stderr)  # full details go to the server logs
    if isinstance(error, ImproperlyConfigured):
        reason = f"Configuration problem: {error}"
    elif isinstance(error, ImportError):
        reason = f"Missing package: {getattr(error, 'name', None) or type(error).__name__}"
    else:
        reason = f"Startup error: {type(error).__name__}"
    import json

    body = json.dumps({"detail": "The MySobo server is not configured correctly.", "reason": reason}).encode()

    def application(environ, start_response):
        start_response("503 Service Unavailable", [("Content-Type", "application/json"), ("Content-Length", str(len(body)))])
        return [body]

app = application
