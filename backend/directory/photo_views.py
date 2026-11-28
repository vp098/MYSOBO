"""Owner photo library for a business: upload, replace, delete, reorder,
and choose which photo is the cover and which is the logo.

Every upload is opened with Pillow, rotated upright, shrunk to at most
2000px and saved again. That rejects files that are not really images and
drops EXIF data such as the GPS location phones add to photos.
"""
import io
import os
import uuid
import warnings

from django.core.files.base import ContentFile
from django.db import transaction
from django.shortcuts import get_object_or_404
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import permissions, serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Business, BusinessPhoto

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
FORMAT_EXTENSION = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_EDGE = 2000
MAX_PIXELS = 40_000_000
MAX_FILES_PER_REQUEST = 10
from billing.limits import photo_limit  # noqa: E402


class PhotoError(ValueError):
    pass


def clean_image(upload):
    """Return a ContentFile with a safe, re-encoded copy of the upload."""
    name = upload.name or "photo"
    if os.path.splitext(name)[1].lower() not in ALLOWED_EXTENSIONS:
        raise PhotoError(f"{name}: use a JPG, PNG or WebP image.")
    if upload.size > MAX_UPLOAD_BYTES:
        raise PhotoError(f"{name}: the file is larger than 8 MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            probe = Image.open(upload)
            probe.verify()
            upload.seek(0)
            image = Image.open(upload)
            fmt = image.format
            if fmt not in FORMAT_EXTENSION:
                raise PhotoError(f"{name}: use a JPG, PNG or WebP image.")
            if image.width * image.height > MAX_PIXELS:
                raise PhotoError(f"{name}: the image is too large.")
            image.load()
    except PhotoError:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise PhotoError(f"{name}: this file is not a readable image.")

    image = ImageOps.exif_transpose(image)
    image.thumbnail((MAX_EDGE, MAX_EDGE))
    out = io.BytesIO()
    if fmt == "JPEG":
        image.convert("RGB").save(out, "JPEG", quality=85, optimize=True, progressive=True)
    elif fmt == "PNG":
        image.save(out, "PNG", optimize=True)
    else:
        image.save(out, "WEBP", quality=85)
    return ContentFile(out.getvalue(), name=f"{uuid.uuid4().hex}{FORMAT_EXTENSION[fmt]}")


def owned_business(request, business_id, lock=False):
    queryset = Business.objects.select_for_update() if lock else Business.objects.all()
    return get_object_or_404(queryset, id=business_id, deleted_at__isnull=True, members__user=request.user)


class PhotoSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    is_cover = serializers.SerializerMethodField()
    is_logo = serializers.SerializerMethodField()
    size = serializers.SerializerMethodField()

    class Meta:
        model = BusinessPhoto
        fields = ("id", "url", "sort", "is_cover", "is_logo", "size", "created_at")

    def get_url(self, photo):
        request = self.context.get("request")
        url = photo.path.url
        return request.build_absolute_uri(url) if request else url

    def get_is_cover(self, photo):
        return bool(photo.path) and self.context["business"].cover_image.name == photo.path.name

    def get_is_logo(self, photo):
        return bool(photo.path) and self.context["business"].logo.name == photo.path.name

    def get_size(self, photo):
        try:
            return photo.path.size
        except (OSError, ValueError, NotImplementedError):
            return None


def library_response(request, business, code=status.HTTP_200_OK, errors=None):
    business.refresh_from_db(fields=["cover_image", "logo"])
    photos = business.photos.order_by("sort", "created_at")
    body = {
        "photos": PhotoSerializer(photos, many=True, context={"request": request, "business": business}).data,
        "limit": photo_limit(business.plan),
        "plan": business.plan,
    }
    if errors:
        body["errors"] = errors
    return Response(body, status=code)


class OwnerPhotosView(APIView):
    """GET the library; POST multipart `files` (one or more) to add photos."""

    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)
    throttle_scope = "photo_upload"

    def get_throttles(self):
        if self.request.method == "POST":
            from rest_framework.throttling import ScopedRateThrottle
            return [ScopedRateThrottle()]
        return []

    def get(self, request, business_id):
        return library_response(request, owned_business(request, business_id))

    def post(self, request, business_id):
        files = request.FILES.getlist("files")
        if not files:
            return Response({"detail": "Choose at least one image.", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        if len(files) > MAX_FILES_PER_REQUEST:
            return Response({"detail": f"Upload up to {MAX_FILES_PER_REQUEST} images at a time.", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)

        cleaned, errors = [], []
        for upload in files:
            try:
                cleaned.append(clean_image(upload))
            except PhotoError as error:
                errors.append(str(error))

        with transaction.atomic():
            business = owned_business(request, business_id, lock=True)
            limit = photo_limit(business.plan)
            existing = business.photos.count()
            room = max(limit - existing, 0)
            if cleaned and room == 0:
                return Response(
                    {"detail": f"Your {business.get_plan_display()} plan allows {limit} photos. Delete one or upgrade your plan.", "code": "limit"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(cleaned) > room:
                errors.append(f"Only {room} more photo(s) fit in your {business.get_plan_display()} plan, so {len(cleaned) - room} were skipped.")
                cleaned = cleaned[:room]
            next_sort = (business.photos.order_by("-sort").values_list("sort", flat=True).first() or 0) + 1
            created = []
            for offset, content in enumerate(cleaned):
                photo = BusinessPhoto(business=business, sort=next_sort + offset)
                photo.path.save(f"{business.id}/{content.name}", content, save=False)
                photo.save()
                created.append(photo)
            if created and not business.cover_image:
                business.cover_image.name = created[0].path.name
                business.save(update_fields=["cover_image"])

        if not created:
            return Response({"detail": errors[0] if errors else "No images were uploaded.", "code": "invalid", "errors": errors}, status=status.HTTP_400_BAD_REQUEST)
        return library_response(request, business, status.HTTP_201_CREATED, errors)


class OwnerPhotoDetailView(APIView):
    """PUT a new `file` to replace a photo in place; DELETE to remove it."""

    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)

    def put(self, request, business_id, photo_id):
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Choose an image.", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            content = clean_image(upload)
        except PhotoError as error:
            return Response({"detail": str(error), "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            business = owned_business(request, business_id, lock=True)
            photo = get_object_or_404(BusinessPhoto, id=photo_id, business=business)
            old = photo.path.name
            photo.path.save(f"{business.id}/{content.name}", content, save=True)
            changed = []
            if business.cover_image.name == old:
                business.cover_image.name = photo.path.name
                changed.append("cover_image")
            if business.logo.name == old:
                business.logo.name = photo.path.name
                changed.append("logo")
            if changed:
                business.save(update_fields=changed)
        photo.path.storage.delete(old)
        return library_response(request, business)

    def delete(self, request, business_id, photo_id):
        with transaction.atomic():
            business = owned_business(request, business_id, lock=True)
            photo = get_object_or_404(BusinessPhoto, id=photo_id, business=business)
            name = photo.path.name
            storage = photo.path.storage
            changed = []
            if business.cover_image.name == name:
                business.cover_image = ""
                changed.append("cover_image")
            if business.logo.name == name:
                business.logo = ""
                changed.append("logo")
            photo.delete()
            if "cover_image" in changed:
                # Fall back to the next photo so the listing keeps a cover.
                nxt = business.photos.order_by("sort", "created_at").first()
                if nxt:
                    business.cover_image.name = nxt.path.name
            if changed:
                business.save(update_fields=changed)
        if name:
            storage.delete(name)
        return library_response(request, business)


class OwnerPhotoRoleView(APIView):
    """POST {"as": "cover" | "logo"} to use this photo for that role."""

    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (JSONParser,)

    def post(self, request, business_id, photo_id):
        role = request.data.get("as")
        if role not in ("cover", "logo"):
            return Response({"detail": "Choose cover or logo.", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            business = owned_business(request, business_id, lock=True)
            photo = get_object_or_404(BusinessPhoto, id=photo_id, business=business)
            field = "cover_image" if role == "cover" else "logo"
            getattr(business, field).name = photo.path.name
            business.save(update_fields=[field])
        return library_response(request, business)


class OwnerPhotoOrderView(APIView):
    """PUT {"ids": [...]} with every photo id in the new order."""

    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (JSONParser,)

    def put(self, request, business_id):
        ids = request.data.get("ids")
        if not isinstance(ids, list):
            return Response({"detail": "Send the photo ids in order.", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            business = owned_business(request, business_id, lock=True)
            photos = {str(photo.id): photo for photo in business.photos.select_for_update()}
            if sorted(map(str, ids)) != sorted(photos):
                return Response({"detail": "The list must contain each photo exactly once. Refresh and try again.", "code": "conflict"}, status=status.HTTP_409_CONFLICT)
            for index, photo_id in enumerate(ids):
                photo = photos[str(photo_id)]
                if photo.sort != index:
                    photo.sort = index
                    photo.save(update_fields=["sort"])
        return library_response(request, business)
