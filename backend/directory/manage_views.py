"""Owner catalog management, admin catalog moderation and admin user management."""
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AdminRole, Profile

from .models import AuditLog, Business, BusinessProduct, BusinessService
from .permissions import IsSuperAdmin

User = get_user_model()
MODELS = {"service": BusinessService, "product": BusinessProduct}


def item_row(item, kind):
    row = {
        "id": str(item.id), "type": kind, "name": item.name, "description": item.description,
        "business_id": str(item.business_id), "business": item.business.name, "business_slug": item.business.slug,
        "category": item.category.name if item.category_id else "", "category_id": str(item.category_id) if item.category_id else None,
        "active": item.active, "available": item.available, "updated_at": item.updated_at,
    }
    if kind == "service":
        row.update(price_min=item.price_min, price_max=item.price_max, service_area=item.service_area)
    else:
        row.update(price=item.price, brand=item.brand, model=item.model)
    return row


def _money(value):
    if value in (None, ""):
        return None
    try:
        amount = Decimal(str(value))
    except InvalidOperation as error:
        raise ValueError("Enter a valid price.") from error
    if amount < 0:
        raise ValueError("Price cannot be negative.")
    return amount


def _apply_changes(item, kind, data):
    fields = []
    for key in ("name", "description"):
        if key in data:
            value = " ".join(str(data[key]).split()) if key == "name" else str(data[key]).strip()
            if key == "name" and len(value) < 2:
                raise ValueError("Enter a name.")
            setattr(item, key, value[:200] if key == "name" else value[:4000])
            fields.append(key)
    for key in ("active", "available"):
        if key in data:
            if not isinstance(data[key], bool):
                raise ValueError(f"{key} must be true or false.")
            setattr(item, key, data[key])
            fields.append(key)
    money_fields = ("price_min", "price_max") if kind == "service" else ("price",)
    for key in money_fields:
        if key in data:
            setattr(item, key, _money(data[key]))
            fields.append(key)
    if kind == "service" and item.price_min is not None and item.price_max is not None and item.price_max < item.price_min:
        raise ValueError("The highest price must be at least the lowest price.")
    return fields


class OwnerCatalogView(APIView):
    """All services and products (active or not) of a listing you manage. GET ?business_id="""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        business = get_object_or_404(Business, id=request.query_params.get("business_id"), members__user=request.user, deleted_at__isnull=True)
        rows = [item_row(item, "service") for item in BusinessService.objects.filter(business=business).select_related("business", "category").order_by("name")]
        rows += [item_row(item, "product") for item in BusinessProduct.objects.filter(business=business).select_related("business", "category").order_by("name")]
        return Response(rows)


class OwnerCatalogItemView(APIView):
    """Edit (PATCH) or delete (DELETE) one of your own services or products."""

    permission_classes = (permissions.IsAuthenticated,)

    def _item(self, request, kind, item_id):
        model = MODELS.get(kind)
        if model is None:
            return None
        return get_object_or_404(model.objects.select_related("business", "category"), id=item_id, business__members__user=request.user)

    def patch(self, request, kind, item_id):
        item = self._item(request, kind, item_id)
        if item is None:
            return Response({"detail": "Unknown item type."}, status=status.HTTP_404_NOT_FOUND)
        try:
            fields = _apply_changes(item, kind, request.data)
        except ValueError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        if fields:
            item.save(update_fields=[*fields, "updated_at"])
        return Response(item_row(item, kind))

    def delete(self, request, kind, item_id):
        item = self._item(request, kind, item_id)
        if item is None:
            return Response({"detail": "Unknown item type."}, status=status.HTTP_404_NOT_FOUND)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminCatalogView(APIView):
    """Every service and product. ?type=service|product, ?q=, ?status=active|inactive."""

    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        kinds = [request.query_params["type"]] if request.query_params.get("type") in MODELS else list(MODELS)
        query = (request.query_params.get("q") or "").strip()
        wanted = request.query_params.get("status")
        rows = []
        for kind in kinds:
            items = MODELS[kind].objects.select_related("business", "category").filter(business__deleted_at__isnull=True)
            if query:
                items = items.filter(Q(name__icontains=query) | Q(business__name__icontains=query) | Q(category__name__icontains=query))
            if wanted == "active":
                items = items.filter(active=True)
            elif wanted == "inactive":
                items = items.filter(active=False)
            rows += [item_row(item, kind) for item in items.order_by("-updated_at")[:200]]
        rows.sort(key=lambda row: row["updated_at"], reverse=True)
        return Response(rows[:300])


class AdminCatalogItemView(APIView):
    """Switch a service or product on/off (PATCH {active}). Inappropriate or duplicate entries are switched off, not deleted."""

    permission_classes = (IsSuperAdmin,)

    def patch(self, request, kind, item_id):
        model = MODELS.get(kind)
        if model is None:
            return Response({"detail": "Unknown item type."}, status=status.HTTP_404_NOT_FOUND)
        item = get_object_or_404(model.objects.select_related("business", "category"), id=item_id)
        active = request.data.get("active")
        if not isinstance(active, bool):
            return Response({"detail": "active must be true or false."}, status=status.HTTP_400_BAD_REQUEST)
        item.active = active
        item.save(update_fields=["active", "updated_at"])
        AuditLog.objects.create(actor=request.user, action=f"{kind}_{'enabled' if active else 'disabled'}", target_type=model.__name__,
                                target_id=str(item.id), after={"name": item.name, "business": item.business.name, "active": active})
        return Response(item_row(item, kind))


class AdminUserUpdateView(APIView):
    """PATCH {active?, super_admin?, account_type?} for one person. Admins cannot lock themselves out."""

    permission_classes = (IsSuperAdmin,)

    @transaction.atomic
    def patch(self, request, user_id):
        user = get_object_or_404(User.objects.select_for_update(), id=user_id)
        changes = {}
        if "active" in request.data:
            active = request.data["active"]
            if not isinstance(active, bool):
                return Response({"detail": "active must be true or false."}, status=status.HTTP_400_BAD_REQUEST)
            if user.pk == request.user.pk and not active:
                return Response({"detail": "You cannot deactivate your own account."}, status=status.HTTP_400_BAD_REQUEST)
            user.is_active = active
            user.save(update_fields=["is_active"])
            changes["active"] = active
        if "super_admin" in request.data:
            grant = request.data["super_admin"]
            if not isinstance(grant, bool):
                return Response({"detail": "super_admin must be true or false."}, status=status.HTTP_400_BAD_REQUEST)
            if user.pk == request.user.pk and not grant:
                return Response({"detail": "You cannot remove your own Super Admin role."}, status=status.HTTP_400_BAD_REQUEST)
            if grant:
                AdminRole.objects.get_or_create(user=user, role=AdminRole.Role.SUPER_ADMIN, defaults={"created_by": request.user})
            else:
                AdminRole.objects.filter(user=user, role=AdminRole.Role.SUPER_ADMIN).delete()
            changes["super_admin"] = grant
        if "account_type" in request.data:
            kind = request.data["account_type"]
            if kind not in Profile.AccountType.values:
                return Response({"detail": "Choose resident or business owner."}, status=status.HTTP_400_BAD_REQUEST)
            Profile.objects.update_or_create(id=user, defaults={"account_type": kind})
            changes["account_type"] = kind
        if not changes:
            return Response({"detail": "Nothing to change."}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.objects.create(actor=request.user, action="user_updated", target_type="User", target_id=str(user.pk),
                                after={"email": user.email, **changes})
        return Response({"id": str(user.pk), **changes})
