"""Predictable JSON errors for the API.

Every error leaves as {"detail": "...", "code": "..."} with a sensible status.
Database problems never reach the client as a traceback or an HTML 500 page;
they are logged server-side instead.
"""
import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import DatabaseError, IntegrityError, OperationalError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.views import set_rollback

logger = logging.getLogger("mysobo.api")


def _first_message(errors):
    """Turn {"name": ["This field is required."]} into "name: This field is required."."""
    for field, value in errors.items():
        while isinstance(value, (list, tuple)) and value:
            value = value[0]
        if isinstance(value, dict):
            return _first_message(value)
        label = "" if field == "non_field_errors" else f"{field.replace('_', ' ')}: "
        return f"{label}{value}"
    return "Please check the form and try again."


def _with_code(response, exc):
    data = response.data
    if isinstance(data, dict) and "code" not in data:
        code = getattr(exc, "default_code", None) or {
            404: "not_found", 403: "permission_denied", 401: "not_authenticated", 405: "method_not_allowed",
        }.get(response.status_code, "error")
        if "detail" not in data:
            data = {**data, "detail": _first_message(data), "code": "invalid"}
        else:
            data = {**data, "code": code}
        response.data = data
    elif isinstance(data, list):
        response.data = {"detail": " ".join(str(item) for item in data), "code": "invalid"}
    return response


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None:
        return _with_code(response, exc)

    set_rollback()
    view = context.get("view").__class__.__name__ if context.get("view") else "?"

    if isinstance(exc, DjangoValidationError):
        messages = getattr(exc, "messages", [str(exc)])
        return Response({"detail": " ".join(messages), "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)

    if isinstance(exc, IntegrityError):
        logger.warning("Integrity conflict in %s: %s", view, exc)
        return Response(
            {"detail": "This conflicts with an existing record. Refresh and try again.", "code": "conflict"},
            status=status.HTTP_409_CONFLICT,
        )

    if isinstance(exc, OperationalError) and "timeout" in str(exc).lower():
        logger.error("Query timed out in %s: %s", view, exc)
        return Response(
            {"detail": "This is taking too long. Please try again.", "code": "timeout"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    if isinstance(exc, DatabaseError):
        logger.exception("Database error in %s", view)
        return Response(
            {"detail": "MySobo is busy right now. Please try again in a moment.", "code": "unavailable"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    logger.exception("Unhandled error in %s", view)
    return Response(
        {"detail": "Something went wrong on our side. Please try again.", "code": "server_error"},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
