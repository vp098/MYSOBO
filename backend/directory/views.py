from django.db.models import Q
from django.core.exceptions import ValidationError
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Business, BusinessMember, Category, Claim
from .permissions import IsAdminOrMember
from .serializers import BusinessSerializer, CategorySerializer


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    pagination_class = None


class BusinessViewSet(viewsets.ModelViewSet):
    serializer_class = BusinessSerializer
    permission_classes = (permissions.IsAuthenticatedOrReadOnly,)

    def get_object(self):
        queryset = self.filter_queryset(self.get_queryset())
        lookup = self.kwargs[self.lookup_url_kwarg or self.lookup_field]
        obj = None
        try:
            obj = queryset.filter(**{self.lookup_field: lookup}).first()
        except (TypeError, ValueError, ValidationError):
            pass
        if obj is None:
            obj = queryset.filter(slug=lookup).first()
        if obj is None:
            from django.http import Http404
            raise Http404
        self.check_object_permissions(self.request, obj)
        return obj

    def get_queryset(self):
        qs = Business.objects.filter(deleted_at__isnull=True, hidden=False)
        query = self.request.query_params.get("q")
        if query:
            qs = qs.filter(Q(name__icontains=query) | Q(description__icontains=query))
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(Q(category__slug=category) | Q(category__name__iexact=category))
        kind = self.request.query_params.get("kind")
        if kind in ("service", "product", "both"):
            qs = qs.filter(Q(kind=kind) | Q(kind="both"))
        if self.request.query_params.get("verified") == "true":
            qs = qs.filter(verification_level__gte=2)
        return qs

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy"):
            return [IsAdminOrMember()]
        return super().get_permissions()

    def perform_create(self, serializer):
        if not self.request.user.is_authenticated:
            raise permissions.NotAuthenticated()
        serializer.save(
            source="owner",
            verification_level=0,
            hidden=False,
            created_by=self.request.user,
        )

    def perform_destroy(self, instance):
        if not getattr(self.request.user, "is_superuser", False):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only a super admin may soft-delete listings.")
        from django.utils import timezone
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at", "updated_at"])

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def claim(self, request, pk=None):
        business = self.get_object()
        if business.members.filter(user=request.user).exists():
            return Response({"detail": "Already a member."}, status=409)
        profile_mobile = getattr(getattr(request.user, "profile", None), "mobile", None)
        if profile_mobile and business.phone and profile_mobile == business.phone:
            BusinessMember.objects.create(user=request.user, business=business, role="owner")
            business.verification_level = max(business.verification_level, 1)
            business.save(update_fields=["verification_level", "updated_at"])
            return Response({"status": "approved", "verification_level": 1})
        Claim.objects.create(
            business=business,
            user=request.user,
            proof_path=request.data.get("proof_path", ""),
            status="pending",
        )
        return Response({"status": "pending"})
