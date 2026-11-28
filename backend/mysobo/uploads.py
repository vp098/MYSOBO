from django.conf import settings
from rest_framework import status
from rest_framework.response import Response


def uploads_unavailable():
    """503 while media storage (Supabase Storage) is not configured in production."""
    if getattr(settings, "MEDIA_UPLOADS_ENABLED", True):
        return None
    return Response(
        {"detail": "Photo uploads are not set up yet. Please try again later.", "code": "uploads_unavailable"},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )
