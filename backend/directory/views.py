from django.db.models import Avg, Count, Exists, OuterRef, Prefetch, Q
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import filters, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission, SAFE_METHODS
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.exceptions import ValidationError as APIValidationError

from .models import (
    Business,
    BusinessHour,
    BusinessMember,
    BusinessProduct,
    BusinessService,
    Category,
    CategoryField,
    Claim,
    Event,
    Report,
    Review,
    SavedBusiness,
    Subcategory,
)
from .permissions import IsAdminOrMember, IsSuperAdmin, is_super_admin
from .serializers import (
    BusinessSerializer,
    BusinessProductSerializer,
    BusinessServiceSerializer,
    CategoryAdminSerializer,
    CategoryFieldAdminSerializer,
    CategorySerializer,
    ReviewSerializer,
    SubcategoryAdminSerializer,
)


class BusinessContactEventThrottle(ScopedRateThrottle):
    scope = "business_contact_event"


def matching_subcategory_ids(category_id, slug, category_slug=None):
    if not category_id and category_slug:
        category = Category.objects.filter(
            Q(slug=category_slug) | Q(name__iexact=category_slug),
            active=True,
        ).first()
        category_id = category.id if category else None
    if not category_id:
        return []
    selected = Subcategory.objects.filter(
        category_id=category_id,
        slug=slug,
        active=True,
        approved=True,
    ).first()
    if not selected:
        return []
    descendants = [selected.id]
    children = list(
        Subcategory.objects.filter(
            category_id=category_id, parent_id=selected.id, active=True, approved=True
        ).values_list("id", flat=True)
    )
    while children:
        descendants.extend(children)
        children = list(
            Subcategory.objects.filter(
                category_id=category_id, parent_id__in=children, active=True, approved=True
            ).values_list("id", flat=True)
        )
    return descendants


def search_text(request):
    query = request.query_params.get("q", "").strip()
    if len(query) > 120:
        raise APIValidationError({"q": "Search must be 120 characters or fewer."})
    return query


def apply_category_field_filters(queryset, request, kind, value_field="category_data"):
    category_id = request.query_params.get("category_id")
    subcategory_slug = request.query_params.get("subcategory")
    selected_subcategory = Subcategory.objects.filter(
        category_id=category_id,
        slug=subcategory_slug,
        active=True,
        approved=True,
    ).first() if subcategory_slug and category_id else None
    for parameter, value in request.query_params.items():
        if not parameter.startswith("field_"):
            continue
        field_key = parameter.removeprefix("field_")
        field_queryset = CategoryField.objects.filter(
            category_id=category_id, key=field_key, active=True, filterable=True
        ) if category_id else CategoryField.objects.none()
        if kind in (Business.Kind.SERVICE, Business.Kind.PRODUCT):
            field_queryset = field_queryset.filter(applies_to__in=(kind, "both"))
        if selected_subcategory:
            field_queryset = field_queryset.filter(
                Q(subcategory__isnull=True) | Q(subcategory=selected_subcategory)
            )
        else:
            field_queryset = field_queryset.filter(subcategory__isnull=True)
        field = field_queryset.first()
        if not field:
            raise APIValidationError(
                {parameter: "This filter is not configured for the selected category."}
            )
        if field.field_type == CategoryField.FieldType.NUMBER:
            try:
                value = float(value)
            except ValueError as exc:
                raise APIValidationError({parameter: "Enter a number."}) from exc
        elif field.field_type == CategoryField.FieldType.BOOLEAN:
            if value.lower() not in ("true", "false"):
                raise APIValidationError({parameter: "Choose true or false."})
            value = value.lower() == "true"
        elif field.field_type == CategoryField.FieldType.CHOICE and value not in field.options:
            raise APIValidationError({parameter: "Choose one of the configured options."})
        queryset = queryset.filter(**{f"{value_field}__{field.key}": value})
    return queryset


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    pagination_class = None

    def get_queryset(self):
        kind = self.request.query_params.get("kind")
        if kind == "product":
            listing_filter = Q(
                business__hidden=False,
                business__deleted_at__isnull=True,
                business__kind__in=(Business.Kind.PRODUCT, Business.Kind.BOTH),
            )
            subcategories = Subcategory.objects.filter(
                approved=True, active=True
            ).annotate(listing_count=Count("business", filter=listing_filter, distinct=True))
            queryset = Category.objects.filter(
                active=True, supports_products=True
            ).annotate(
                listing_count=Count("business", filter=listing_filter, distinct=True)
            ).prefetch_related(Prefetch("subcategories", queryset=subcategories))
        elif kind == "service":
            listing_filter = Q(
                business__hidden=False,
                business__deleted_at__isnull=True,
                business__kind__in=(Business.Kind.SERVICE, Business.Kind.BOTH),
            )
            subcategories = Subcategory.objects.filter(
                approved=True, active=True
            ).annotate(listing_count=Count("business", filter=listing_filter, distinct=True))
            queryset = Category.objects.filter(
                active=True, supports_services=True
            ).annotate(
                listing_count=Count("business", filter=listing_filter, distinct=True)
            ).prefetch_related(Prefetch("subcategories", queryset=subcategories))
        else:
            listing_filter = Q(business__hidden=False, business__deleted_at__isnull=True)
            subcategories = Subcategory.objects.filter(
                approved=True, active=True
            ).annotate(listing_count=Count("business", filter=listing_filter))
            queryset = Category.objects.filter(active=True).annotate(
                listing_count=Count("business", filter=listing_filter, distinct=True)
            ).prefetch_related(Prefetch("subcategories", queryset=subcategories))
        fields = CategoryField.objects.filter(active=True)
        return queryset.prefetch_related(Prefetch("fields", queryset=fields))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["kind"] = self.request.query_params.get("kind", "all")
        context["include_subcategories"] = True
        return context


class AdminCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = (IsSuperAdmin,)
    serializer_class = CategoryAdminSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    filter_backends = (filters.SearchFilter,)
    pagination_class = None
    search_fields = ("name", "slug")
    queryset = Category.objects.all().order_by("priority", "name")

    def get_queryset(self):
        queryset = super().get_queryset()
        active = self.request.query_params.get("active")
        if active in ("true", "false"):
            queryset = queryset.filter(active=(active == "true"))
        kind = self.request.query_params.get("kind")
        if kind == "service":
            queryset = queryset.filter(supports_services=True)
        elif kind == "product":
            queryset = queryset.filter(supports_products=True)
        return queryset

    def perform_destroy(self, instance):
        instance.active = False
        instance.save(update_fields=("active",))


class AdminSubcategoryViewSet(viewsets.ModelViewSet):
    permission_classes = (IsSuperAdmin,)
    serializer_class = SubcategoryAdminSerializer
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    filter_backends = (filters.SearchFilter,)
    pagination_class = None
    search_fields = ("name", "slug", "category__name")
    queryset = Subcategory.objects.select_related("category", "parent").order_by(
        "category__priority", "priority", "name"
    )

    def get_queryset(self):
        queryset = super().get_queryset()
        category_id = self.request.query_params.get("category_id")
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        active = self.request.query_params.get("active")
        if active in ("true", "false"):
            queryset = queryset.filter(active=(active == "true"))
        return queryset

    def perform_destroy(self, instance):
        instance.active = False
        instance.save(update_fields=("active",))


class AdminCategoryFieldViewSet(viewsets.ModelViewSet):
    permission_classes = (IsSuperAdmin,)
    serializer_class = CategoryFieldAdminSerializer
    pagination_class = None
    filter_backends = (filters.SearchFilter,)
    search_fields = ("label", "key", "category__name")
    queryset = CategoryField.objects.select_related("category", "subcategory").order_by(
        "category__priority", "priority", "label"
    )

    def get_queryset(self):
        queryset = super().get_queryset()
        category_id = self.request.query_params.get("category_id")
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        active = self.request.query_params.get("active")
        if active in ("true", "false"):
            queryset = queryset.filter(active=(active == "true"))
        return queryset

    def perform_destroy(self, instance):
        instance.active = False
        instance.save(update_fields=("active",))


class CanManageCatalogRecord(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS or request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return is_super_admin(request.user) or obj.business.members.filter(user=request.user).exists()


class BusinessProductViewSet(viewsets.ModelViewSet):
    serializer_class = BusinessProductSerializer
    permission_classes = (permissions.IsAuthenticatedOrReadOnly, CanManageCatalogRecord)

    def get_queryset(self):
        user = self.request.user
        queryset = BusinessProduct.objects.select_related(
            "business", "category", "subcategory", "business__category"
        ).annotate(
            average_rating=Avg("business__reviews__rating"),
            review_count=Count("business__reviews", distinct=True),
        )
        public = Q(
            active=True,
            available=True,
            business__hidden=False,
            business__deleted_at__isnull=True,
            category__active=True,
        )
        if is_super_admin(user):
            queryset = queryset.filter(business__deleted_at__isnull=True)
        elif user.is_authenticated:
            queryset = queryset.filter(
                public | Q(business__members__user=user)
            ).distinct()
        else:
            queryset = queryset.filter(public)
        query = search_text(self.request)
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(brand__icontains=query)
                | Q(model__icontains=query)
                | Q(description__icontains=query)
                | Q(business__name__icontains=query)
                | Q(category__name__icontains=query)
                | Q(subcategory__name__icontains=query)
            )
        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(
                Q(category__slug=category) | Q(category__name__iexact=category),
                category__active=True,
            )
        category_id = self.request.query_params.get("category_id")
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        business_id = self.request.query_params.get("business_id")
        if business_id:
            queryset = queryset.filter(business_id=business_id)
        subcategory = self.request.query_params.get("subcategory")
        if subcategory:
            subcategory_ids = matching_subcategory_ids(category_id, subcategory, category)
            queryset = queryset.filter(
                subcategory_id__in=subcategory_ids,
            )
        location = self.request.query_params.get("location")
        if location:
            queryset = queryset.filter(
                Q(business__address__icontains=location)
                | Q(business__society__name__icontains=location)
            )
        if self.request.query_params.get("verified") == "true":
            queryset = queryset.filter(business__verification_level__gte=2)
        if self.request.query_params.get("available") in ("true", "false"):
            queryset = queryset.filter(available=(self.request.query_params["available"] == "true"))
        minimum_price = self.request.query_params.get("min_price")
        maximum_price = self.request.query_params.get("max_price")
        try:
            if minimum_price:
                queryset = queryset.filter(price__gte=float(minimum_price))
            if maximum_price:
                queryset = queryset.filter(price__lte=float(maximum_price))
        except ValueError as exc:
            raise APIValidationError({"price": "Enter a valid price range."}) from exc
        minimum_rating = self.request.query_params.get("min_rating")
        if minimum_rating:
            try:
                queryset = queryset.filter(average_rating__gte=float(minimum_rating))
            except ValueError as exc:
                raise APIValidationError({"min_rating": "Enter a rating from 0 to 5."}) from exc
        queryset = apply_category_field_filters(
            queryset, self.request, Business.Kind.PRODUCT
        )
        ordering = self.request.query_params.get("ordering", "relevance")
        ordering_fields = {
            "relevance": ("-business__verification_level", "-created_at"),
            "rating": ("-average_rating", "-review_count", "-created_at"),
            "recent": ("-created_at",),
            "alphabetical": ("name",),
            "price_low": ("price", "name"),
            "price_high": ("-price", "name"),
        }
        return queryset.order_by(*ordering_fields.get(ordering, ordering_fields["relevance"]))

    def perform_create(self, serializer):
        business = serializer.validated_data["business"]
        if not is_super_admin(self.request.user) and not business.members.filter(
            user=self.request.user
        ).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only add products to a business you manage.")
        serializer.save()

    def perform_destroy(self, instance):
        instance.active = False
        instance.save(update_fields=("active",))


class BusinessServiceViewSet(viewsets.ModelViewSet):
    serializer_class = BusinessServiceSerializer
    permission_classes = (permissions.IsAuthenticatedOrReadOnly, CanManageCatalogRecord)

    def get_queryset(self):
        user = self.request.user
        queryset = BusinessService.objects.select_related(
            "business", "category", "subcategory", "business__category"
        ).annotate(
            average_rating=Avg("business__reviews__rating"),
            review_count=Count("business__reviews", distinct=True),
        )
        public = Q(
            active=True,
            available=True,
            business__hidden=False,
            business__deleted_at__isnull=True,
            category__active=True,
        )
        if is_super_admin(user):
            queryset = queryset.filter(business__deleted_at__isnull=True)
        elif user.is_authenticated:
            queryset = queryset.filter(
                public | Q(business__members__user=user)
            ).distinct()
        else:
            queryset = queryset.filter(public)
        query = search_text(self.request)
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(service_area__icontains=query)
                | Q(business__name__icontains=query)
                | Q(category__name__icontains=query)
                | Q(subcategory__name__icontains=query)
            )
        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(
                Q(category__slug=category) | Q(category__name__iexact=category),
                category__active=True,
            )
        category_id = self.request.query_params.get("category_id")
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        business_id = self.request.query_params.get("business_id")
        if business_id:
            queryset = queryset.filter(business_id=business_id)
        subcategory = self.request.query_params.get("subcategory")
        if subcategory:
            subcategory_ids = matching_subcategory_ids(category_id, subcategory, category)
            queryset = queryset.filter(
                subcategory_id__in=subcategory_ids,
            )
        location = self.request.query_params.get("location")
        if location:
            queryset = queryset.filter(
                Q(business__address__icontains=location)
                | Q(business__society__name__icontains=location)
                | Q(service_area__icontains=location)
            )
        if self.request.query_params.get("verified") == "true":
            queryset = queryset.filter(business__verification_level__gte=2)
        if self.request.query_params.get("available") in ("true", "false"):
            queryset = queryset.filter(available=(self.request.query_params["available"] == "true"))
        minimum_price = self.request.query_params.get("min_price")
        maximum_price = self.request.query_params.get("max_price")
        try:
            if minimum_price:
                queryset = queryset.filter(price_min__gte=float(minimum_price))
            if maximum_price:
                queryset = queryset.filter(price_max__lte=float(maximum_price))
        except ValueError as exc:
            raise APIValidationError({"price": "Enter a valid price range."}) from exc
        minimum_rating = self.request.query_params.get("min_rating")
        if minimum_rating:
            try:
                queryset = queryset.filter(average_rating__gte=float(minimum_rating))
            except ValueError as exc:
                raise APIValidationError({"min_rating": "Enter a rating from 0 to 5."}) from exc
        queryset = apply_category_field_filters(
            queryset, self.request, Business.Kind.SERVICE
        )
        ordering = self.request.query_params.get("ordering", "relevance")
        ordering_fields = {
            "relevance": ("-business__verification_level", "-created_at"),
            "rating": ("-average_rating", "-review_count", "-created_at"),
            "recent": ("-created_at",),
            "alphabetical": ("name",),
            "price_low": ("price_min", "name"),
            "price_high": ("-price_max", "name"),
        }
        return queryset.order_by(*ordering_fields.get(ordering, ordering_fields["relevance"]))

    def perform_create(self, serializer):
        business = serializer.validated_data["business"]
        if not is_super_admin(self.request.user) and not business.members.filter(
            user=self.request.user
        ).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only add services to a business you manage.")
        serializer.save()

    def perform_destroy(self, instance):
        instance.active = False
        instance.save(update_fields=("active",))


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
        qs = Business.objects.filter(deleted_at__isnull=True).select_related(
            "category", "subcategory", "society"
        ).prefetch_related("photos", "hours").annotate(
            average_rating=Avg("reviews__rating"),
            review_count=Count("reviews", distinct=True),
        )
        user = self.request.user
        if is_super_admin(user):
            pass
        elif user.is_authenticated:
            qs = qs.filter(Q(hidden=False) | Q(members__user=user)).distinct()
        else:
            qs = qs.filter(hidden=False)
        query = search_text(self.request)
        if query:
            matching_products = BusinessProduct.objects.filter(
                business_id=OuterRef("pk"), active=True, available=True
            ).filter(
                Q(name__icontains=query)
                | Q(brand__icontains=query)
                | Q(model__icontains=query)
                | Q(description__icontains=query)
                | Q(category__name__icontains=query)
                | Q(subcategory__name__icontains=query)
            )
            matching_services = BusinessService.objects.filter(
                business_id=OuterRef("pk"), active=True, available=True
            ).filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(service_area__icontains=query)
                | Q(category__name__icontains=query)
                | Q(subcategory__name__icontains=query)
            )
            qs = qs.annotate(
                _matches_product=Exists(matching_products),
                _matches_service=Exists(matching_services),
            )
            qs = qs.filter(
                Q(name__icontains=query)
                | Q(description__icontains=query)
                | Q(address__icontains=query)
                | Q(phone__icontains=query)
                | Q(whatsapp__icontains=query)
                | Q(category__name__icontains=query)
                | Q(subcategory__name__icontains=query)
                | Q(_matches_product=True)
                | Q(_matches_service=True)
            )
        location = self.request.query_params.get("location")
        if location:
            qs = qs.filter(Q(address__icontains=location) | Q(society__name__icontains=location))
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(
                Q(category__slug=category) | Q(category__name__iexact=category),
                category__active=True,
            )
        kind = self.request.query_params.get("kind")
        if kind == "service":
            qs = qs.filter(Q(kind=Business.Kind.SERVICE) | Q(kind=Business.Kind.BOTH))
        elif kind == "product":
            qs = qs.filter(Q(kind=Business.Kind.PRODUCT) | Q(kind=Business.Kind.BOTH))
        elif kind not in (None, "", "all"):
            qs = qs.none()
        category_id = self.request.query_params.get("category_id")
        subcategory = self.request.query_params.get("subcategory")
        if subcategory:
            qs = qs.filter(
                subcategory_id__in=matching_subcategory_ids(category_id, subcategory, category)
            )
            if kind == "service":
                qs = qs.filter(subcategory__supports_services=True)
            elif kind == "product":
                qs = qs.filter(subcategory__supports_products=True)
        if self.request.query_params.get("verified") == "true":
            qs = qs.filter(verification_level__gte=2)
        minimum_rating = self.request.query_params.get("min_rating")
        if minimum_rating:
            try:
                minimum_rating = float(minimum_rating)
            except ValueError as exc:
                raise APIValidationError({"min_rating": "Enter a rating from 0 to 5."}) from exc
            if not 0 <= minimum_rating <= 5:
                raise APIValidationError({"min_rating": "Enter a rating from 0 to 5."})
            qs = qs.filter(average_rating__gte=minimum_rating)
        if self.request.query_params.get("open_now") == "true":
            local_now = timezone.localtime()
            open_hours = BusinessHour.objects.filter(
                business=OuterRef("pk"),
                dow=local_now.weekday(),
                closed=False,
                opens__lte=local_now.time(),
                closes__gt=local_now.time(),
            )
            qs = qs.filter(Exists(open_hours))
        if category_id:
            qs = qs.filter(category_id=category_id, category__active=True)
        qs = apply_category_field_filters(qs, self.request, kind)
        ordering = self.request.query_params.get("ordering", "recent")
        ordering_fields = {
            "relevance": ("-verification_level", "-created_at"),
            "rating": ("-average_rating", "-review_count", "-created_at"),
            "recent": ("-created_at",),
            "alphabetical": ("name",),
        }
        qs = qs.order_by(*ordering_fields.get(ordering, ordering_fields["recent"]))
        return qs

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy"):
            return [IsAdminOrMember()]
        return super().get_permissions()

    def perform_create(self, serializer):
        if not self.request.user.is_authenticated:
            raise permissions.NotAuthenticated()
        business = serializer.save(
            source="owner",
            verification_level=0,
            hidden=True,
            created_by=self.request.user,
        )
        BusinessMember.objects.create(
            user=self.request.user,
            business=business,
            role=BusinessMember.Role.OWNER,
        )

    def perform_destroy(self, instance):
        if not getattr(self.request.user, "is_superuser", False):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only a super admin may soft-delete listings.")
        from django.utils import timezone
        instance.deleted_at = timezone.now()
        instance.save(update_fields=["deleted_at", "updated_at"])

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[permissions.AllowAny],
        throttle_classes=[BusinessContactEventThrottle],
        url_path="events",
    )
    def events(self, request, pk=None):
        business = self.get_object()
        event_type = request.data.get("type")
        if event_type not in ("call", "whatsapp"):
            raise APIValidationError({"type": "Choose call or whatsapp."})
        Event.objects.create(
            business=business,
            user=request.user if request.user.is_authenticated else None,
            type=event_type,
        )
        return Response({"status": "recorded"}, status=201)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def claim(self, request, pk=None):
        business = self.get_object()
        if business.members.filter(user=request.user).exists():
            return Response({"detail": "Already a member."}, status=409)
        if Claim.objects.filter(
            business=business, user=request.user, status=Claim.Status.PENDING
        ).exists():
            return Response({"detail": "A claim is already pending review."}, status=409)
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

    @action(detail=True, methods=["get", "post"], permission_classes=[permissions.IsAuthenticatedOrReadOnly])
    def reviews(self, request, pk=None):
        business = self.get_object()
        if request.method == "GET":
            reviews = business.reviews.select_related("user").all()
            return Response(ReviewSerializer(reviews, many=True).data)
        serializer = ReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if Review.objects.filter(business=business, user=request.user).exists():
            return Response({"detail": "You have already reviewed this business."}, status=409)
        review = serializer.save(business=business, user=request.user)
        return Response(ReviewSerializer(review).data, status=201)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def report(self, request, pk=None):
        business = self.get_object()
        reason = request.data.get("reason", "")
        if not isinstance(reason, str) or not reason.strip():
            raise APIValidationError({"reason": "Describe why you are reporting this listing."})
        report = Report.objects.create(
            business=business,
            reporter=request.user,
            reason=reason.strip(),
        )
        return Response({"id": str(report.id), "status": report.status}, status=201)

    @action(detail=True, methods=["get", "post", "delete"], permission_classes=[permissions.IsAuthenticatedOrReadOnly])
    def saved(self, request, pk=None):
        business = self.get_object()
        if request.method == "GET":
            return Response({"saved": SavedBusiness.objects.filter(
                business=business, user=request.user
            ).exists()} if request.user.is_authenticated else {"saved": False})
        if request.method == "POST":
            SavedBusiness.objects.get_or_create(business=business, user=request.user)
            return Response({"saved": True})
        SavedBusiness.objects.filter(business=business, user=request.user).delete()
        return Response({"saved": False})
